// EGO Bus Tracker - simple proxy and static file server.
//
// This is a drop-in Go replacement for the previous Python server (server.py);
// it has no external dependencies.
package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	egoAPIHost  = "https://egocptsrvand.ego.gov.tr"
	photonAPI   = "https://photon.komoot.io/api/"
	userAgent   = "EGO-Bus-Tracker/1.0 (Ankara bus tracking demo)"
	defaultAddr = ":5000"

	// Stable EGO data (lines, stops, announcements, timetables) is cached briefly.
	// Live vehicle data (hibrit/srv.asp) is never cached.
	proxyCacheTTL        = 5 * time.Minute
	proxyCacheMaxEntries = 512
	maxUpstreamBodyBytes = 8 << 20

	// Bias geocoding towards Ankara province so addresses outside the city do not
	// show up as nearby stop candidates.
	geocodeLat  = "39.9334"
	geocodeLon  = "32.8597"
	geocodeBBox = "30.9,39.0,33.9,40.6"

	gzipMinBytes = 1024
)

var allowedExtensions = map[string]bool{
	".html": true, ".css": true, ".js": true, ".json": true, ".svg": true,
	".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".ico": true,
	".woff": true, ".woff2": true,
}

// Only these upstream endpoints and functions may be reached through /proxy.
var allowedProxyFunctions = map[string]map[string]bool{
	"/hibrit/act.asp": {
		"Hatlar":       true,
		"HatBilgileri": true,
	},
	"/hibrit/action.asp": {
		"Duraklar":              true,
		"DuraktanGecenHatlar":   true,
		"DuraktanGecisSaatleri": true,
		"Duyurular":             true,
		"YakinDuraklar":         true,
	},
	"/hibrit/srv.asp": {
		"Otobusler": true,
		"Otobus":    true,
	},
}

// Query parameters forwarded to EGO. Anything else is dropped.
var allowedProxyParams = map[string]bool{
	"FNC": true, "LAN": true, "UID": true, "ACSMode": true,
	"QUERY": true, "KOD": true, "HAT": true, "TUR": true, "DURAK": true,
	"LAT": true, "LNG": true, "MSF": true, "YOL": true,
}

type server struct {
	root        string
	proxyClient *http.Client
	geoClient   *http.Client
	cache       *proxyCache
}

func main() {
	addr := flag.String("addr", defaultAddr, "address to listen on (e.g. :5000)")
	root := flag.String("dir", ".", "directory containing static files")
	flag.Parse()

	rootAbs, err := filepath.Abs(*root)
	if err != nil {
		log.Fatalf("failed to resolve static directory: %v", err)
	}

	// TLS verification is disabled because the EGO API certificate cannot be verified.
	// #nosec G402 -- intentionally disabled.
	transport := &http.Transport{
		Proxy:             http.ProxyFromEnvironment,
		ForceAttemptHTTP2: true,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	s := &server{
		root:        rootAbs,
		proxyClient: &http.Client{Transport: transport, Timeout: 30 * time.Second},
		geoClient:   &http.Client{Transport: transport, Timeout: 20 * time.Second},
		cache:       newProxyCache(proxyCacheTTL, proxyCacheMaxEntries),
	}

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           s.loggingMiddleware(http.HandlerFunc(s.route)),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		log.Println("Shutting down server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdownCtx)
	}()

	log.Printf("Server running on http://localhost%s", *addr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func (s *server) loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s - %s %s", r.RemoteAddr, r.Method, r.RequestURI)
		next.ServeHTTP(w, r)
	})
}

func (s *server) route(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	switch r.URL.Path {
	case "/api/geocode":
		s.handleGeocode(w, r)
	case "/proxy":
		s.handleProxy(w, r)
	default:
		s.handleStatic(w, r)
	}
}

// ---------- Helpers ----------

func writeBytes(w http.ResponseWriter, status int, body []byte, contentType string) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		body = []byte(`{"error":"internal server error"}`)
		status = http.StatusInternalServerError
	}
	writeBytes(w, status, body, "application/json; charset=utf-8")
}

// writeBody compresses JSON/text responses when the client supports gzip.
func writeBody(w http.ResponseWriter, r *http.Request, status int, body []byte, contentType string) {
	if !shouldGzip(r, body, contentType) {
		writeBytes(w, status, body, contentType)
		return
	}

	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	_, writeErr := gz.Write(body)
	closeErr := gz.Close()
	if writeErr != nil || closeErr != nil {
		writeBytes(w, status, body, contentType)
		return
	}

	w.Header().Set("Content-Encoding", "gzip")
	w.Header().Add("Vary", "Accept-Encoding")
	writeBytes(w, status, buf.Bytes(), contentType)
}

func shouldGzip(r *http.Request, body []byte, contentType string) bool {
	if len(body) < gzipMinBytes || !acceptsGzip(r.Header.Get("Accept-Encoding")) {
		return false
	}
	ct := strings.ToLower(contentType)
	return strings.HasPrefix(ct, "text/") ||
		strings.Contains(ct, "json") ||
		strings.Contains(ct, "javascript") ||
		strings.Contains(ct, "xml") ||
		strings.Contains(ct, "svg")
}

func acceptsGzip(header string) bool {
	for _, encoding := range strings.Split(header, ",") {
		parts := strings.Split(strings.TrimSpace(encoding), ";")
		if !strings.EqualFold(strings.TrimSpace(parts[0]), "gzip") {
			continue
		}
		for _, param := range parts[1:] {
			param = strings.TrimSpace(param)
			if !strings.HasPrefix(param, "q=") {
				continue
			}
			q, err := strconv.ParseFloat(strings.TrimPrefix(param, "q="), 64)
			if err == nil && q <= 0 {
				return false
			}
		}
		return true
	}
	return false
}

func notFound(w http.ResponseWriter) {
	writeBytes(w, http.StatusNotFound, []byte("<h1>404 Not Found</h1>"), "text/html; charset=utf-8")
}

// ---------- Static files ----------

func (s *server) handleStatic(w http.ResponseWriter, r *http.Request) {
	relPath := r.URL.Path
	if relPath == "/" {
		relPath = "index.html"
	} else {
		relPath = strings.TrimLeft(relPath, "/")
	}

	// Only allow safe static file extensions.
	if !allowedExtensions[strings.ToLower(filepath.Ext(relPath))] {
		notFound(w)
		return
	}
	for _, part := range strings.Split(relPath, "/") {
		if strings.HasPrefix(part, ".") {
			notFound(w)
			return
		}
	}

	candidate := filepath.Join(s.root, filepath.FromSlash(relPath))
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		notFound(w)
		return
	}

	// Prevent escaping the directory (path traversal protection).
	if resolved != s.root && !strings.HasPrefix(resolved, s.root+string(filepath.Separator)) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	info, err := os.Stat(resolved)
	if err != nil || !info.Mode().IsRegular() {
		notFound(w)
		return
	}

	w.Header().Set("Content-Type", contentTypeFor(resolved))
	if strings.EqualFold(filepath.Ext(resolved), ".html") {
		w.Header().Set("Cache-Control", "no-cache")
	} else {
		w.Header().Set("Cache-Control", "public, max-age=300")
	}

	// ServeFile adds Last-Modified and handles conditional and range requests.
	http.ServeFile(w, r, resolved)
}

func contentTypeFor(path string) string {
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if contentType == "" {
		return "application/octet-stream"
	}

	base := contentType
	if i := strings.IndexByte(base, ';'); i >= 0 {
		base = base[:i]
	}
	base = strings.TrimSpace(base)

	if strings.HasPrefix(base, "text/") || base == "application/javascript" || base == "application/json" {
		return base + "; charset=utf-8"
	}
	return contentType
}

// ---------- EGO API proxy ----------

func (s *server) handleProxy(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	pathParam := strings.TrimSpace(query.Get("path"))
	if pathParam == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "path parameter is required"})
		return
	}

	// The path parameter was already decoded during query parsing; do not unquote it again.
	apiPath, params, err := parseProxyPath(pathParam, query)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if err := validateProxyRequest(apiPath, params.Get("FNC")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// Do not forward unknown parameters to EGO.
	for key := range params {
		if !allowedProxyParams[key] {
			params.Del(key)
		}
	}

	target := url.URL{
		Scheme:   "https",
		Host:     strings.TrimPrefix(egoAPIHost, "https://"),
		Path:     apiPath,
		RawQuery: params.Encode(),
	}

	// Live bus positions change constantly and must not be cached.
	if apiPath == "/hibrit/srv.asp" {
		data, contentType, err := s.fetchUpstream(r.Context(), target)
		if err != nil {
			log.Printf("live proxy error for %s: %v", apiPath, err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream request failed"})
			return
		}
		w.Header().Set("X-Cache", "BYPASS")
		writeBody(w, r, http.StatusOK, data, contentType)
		return
	}

	data, contentType, hit, err := s.cache.getOrFetch(target.String(), func() ([]byte, string, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		return s.fetchUpstream(ctx, target)
	})
	if err != nil {
		log.Printf("proxy error for %s: %v", apiPath, err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream request failed"})
		return
	}

	if hit {
		w.Header().Set("X-Cache", "HIT")
	} else {
		w.Header().Set("X-Cache", "MISS")
	}
	writeBody(w, r, http.StatusOK, data, contentType)
}

func parseProxyPath(pathParam string, outer url.Values) (string, url.Values, error) {
	apiPath := pathParam
	params := url.Values{}

	if strings.Contains(pathParam, "?") {
		parsedPath, err := url.Parse(pathParam)
		if err != nil {
			return "", nil, err
		}
		apiPath = parsedPath.Path
		parsedQuery, err := url.ParseQuery(parsedPath.RawQuery)
		if err != nil {
			return "", nil, err
		}
		params = parsedQuery
	}

	// Do not forward the "path" parameter to EGO; only real API parameters are sent.
	for key, values := range outer {
		if key == "path" {
			continue
		}
		if _, exists := params[key]; !exists {
			params[key] = values
		}
	}

	return apiPath, params, nil
}

func validateProxyRequest(apiPath, fnc string) error {
	functions, ok := allowedProxyFunctions[apiPath]
	if !ok {
		return fmt.Errorf("endpoint not allowed")
	}
	if strings.TrimSpace(fnc) == "" {
		return fmt.Errorf("FNC parameter is required")
	}
	if !functions[fnc] {
		return fmt.Errorf("function not allowed for this endpoint")
	}
	return nil
}

func (s *server) fetchUpstream(ctx context.Context, target url.URL) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := s.proxyClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return nil, "", fmt.Errorf("upstream returned %s", resp.Status)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxUpstreamBodyBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(data) > maxUpstreamBodyBytes {
		return nil, "", fmt.Errorf("upstream response too large")
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json; charset=utf-8"
	}
	return data, contentType, nil
}

// ---------- Proxy cache ----------

type cacheEntry struct {
	body        []byte
	contentType string
	expires     time.Time
}

type cacheCall struct {
	done        chan struct{}
	body        []byte
	contentType string
	err         error
}

type proxyCache struct {
	mu         sync.Mutex
	ttl        time.Duration
	maxEntries int
	entries    map[string]cacheEntry
	calls      map[string]*cacheCall
}

func newProxyCache(ttl time.Duration, maxEntries int) *proxyCache {
	if ttl <= 0 {
		ttl = proxyCacheTTL
	}
	if maxEntries <= 0 {
		maxEntries = proxyCacheMaxEntries
	}
	return &proxyCache{
		ttl:        ttl,
		maxEntries: maxEntries,
		entries:    make(map[string]cacheEntry),
		calls:      make(map[string]*cacheCall),
	}
}

// getOrFetch returns a cached response or fetches it once. Concurrent requests for
// the same key wait for the in-flight fetch instead of hitting EGO again.
func (c *proxyCache) getOrFetch(key string, fetch func() ([]byte, string, error)) ([]byte, string, bool, error) {
	now := time.Now()

	c.mu.Lock()
	if entry, ok := c.entries[key]; ok {
		if now.Before(entry.expires) {
			c.mu.Unlock()
			return entry.body, entry.contentType, true, nil
		}
		delete(c.entries, key)
	}
	if call, ok := c.calls[key]; ok {
		c.mu.Unlock()
		<-call.done
		return call.body, call.contentType, false, call.err
	}
	call := &cacheCall{done: make(chan struct{})}
	c.calls[key] = call
	c.mu.Unlock()

	body, contentType, err := fetch()

	c.mu.Lock()
	call.body = body
	call.contentType = contentType
	call.err = err
	delete(c.calls, key)
	if err == nil {
		c.evictLocked(now)
		c.entries[key] = cacheEntry{
			body:        body,
			contentType: contentType,
			expires:     time.Now().Add(c.ttl),
		}
	}
	c.mu.Unlock()
	close(call.done)

	return body, contentType, false, err
}

func (c *proxyCache) evictLocked(now time.Time) {
	if len(c.entries) < c.maxEntries {
		return
	}
	for key, entry := range c.entries {
		if now.After(entry.expires) {
			delete(c.entries, key)
		}
	}
	for key := range c.entries {
		if len(c.entries) < c.maxEntries {
			break
		}
		delete(c.entries, key)
	}
}

// ---------- Geocoding (Photon / OpenStreetMap) ----------

func (s *server) handleGeocode(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	q := strings.TrimSpace(query.Get("q"))
	if q == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "q parameter is required"})
		return
	}

	limit := 10
	if raw := strings.TrimSpace(query.Get("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 20 {
		limit = 20
	}

	params := url.Values{}
	params.Set("q", q)
	params.Set("limit", strconv.Itoa(limit))
	params.Set("lat", geocodeLat)
	params.Set("lon", geocodeLon)
	params.Set("bbox", geocodeBBox)
	target := photonAPI + "?" + params.Encode()

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target, nil)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := s.geoClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}

	writeBody(w, r, http.StatusOK, data, "application/json; charset=utf-8")
}
