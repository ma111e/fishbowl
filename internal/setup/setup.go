package setup

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync"

	log "github.com/sirupsen/logrus"
)

// setupPort is fixed so the extension knows where to signal a completed install.
// The host is "localhost" (not 127.0.0.1) to match the extension's Firefox CSP
// connect-src allowlist (http://localhost:*), mirroring the main server's bind.
const setupPort = "3001"

//go:embed assets
var assets embed.FS

const (
	chromeAsset  = "assets/fishbowl-chrome.zip"
	firefoxAsset = "assets/fishbowl-firefox.xpi"
	iconAsset    = "assets/icon.png"
)

// state tracks install validation and backend startup, shared across handlers.
type state struct {
	mu            sync.Mutex
	once          sync.Once
	startBackend  func()
	installed     bool
	serverStarted bool
}

func (s *state) validate() {
	s.mu.Lock()
	s.installed = true
	s.mu.Unlock()
	s.once.Do(func() {
		if s.startBackend != nil {
			s.startBackend()
		}
		s.mu.Lock()
		s.serverStarted = true
		s.mu.Unlock()
		log.Info("[FishBowl] Extension install validated - backend starting")
	})
}

func (s *state) snapshot() (installed, serverRunning bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.installed, s.serverStarted
}

// Run starts a local install page on a fixed port, opens the default browser to
// it, serves the embedded extension artifacts, and - once the extension signals a
// completed install - starts the backend via startBackend. Blocks until Ctrl-C.
func Run(startBackend func()) error {
	listener, err := net.Listen("tcp", "localhost:"+setupPort)
	if err != nil {
		return fmt.Errorf("setup port %s is in use - free it and retry: %w", setupPort, err)
	}
	url := fmt.Sprintf("http://localhost:%s", setupPort)

	st := &state{startBackend: startBackend}

	// The backend (runServer) generates and logs the pairing code when it
	// starts after install validation; the install page tells the user to read
	// it from the terminal. No code is issued or displayed here.

	mux := http.NewServeMux()
	mux.HandleFunc("/", handleIndex)
	mux.HandleFunc("/download/firefox.xpi", handleDownload(firefoxAsset, "application/x-xpinstall", ""))
	mux.HandleFunc("/download/firefox-file.xpi", handleDownload(firefoxAsset, "application/octet-stream", "fishbowl-firefox.xpi"))
	mux.HandleFunc("/download/chrome.zip", handleDownload(chromeAsset, "application/zip", "fishbowl-chrome.zip"))
	mux.HandleFunc("/icon.png", handleDownload(iconAsset, "image/png", ""))
	mux.HandleFunc("/installed", st.handleInstalled)
	mux.HandleFunc("/status", st.handleStatus)

	log.Infof("FishBowl setup page: %s", url)
	log.Info("Opening your browser… (press Ctrl-C to stop)")
	openBrowser(url)

	return http.Serve(listener, mux)
}

// handleInstalled is the install-validated beacon: called by the extension on
// onInstalled (cross-origin simple POST) and by the page's manual fallback.
func (s *state) handleInstalled(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}
	s.validate()
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

func (s *state) handleStatus(w http.ResponseWriter, r *http.Request) {
	installed, serverRunning := s.snapshot()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{
		"installed":     installed,
		"serverRunning": serverRunning,
	})
}

func assetExists(name string) bool {
	if _, err := fs.Stat(assets, name); err != nil {
		return false
	}
	return true
}

func handleDownload(name, contentType, downloadFilename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := assets.ReadFile(name)
		if err != nil {
			http.Error(w, "This extension build is not bundled in the binary. Rebuild with `make build`.", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", contentType)
		if downloadFilename != "" {
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", downloadFilename))
		}
		_, _ = w.Write(data)
	}
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	data := pageData{
		Browser:          detectBrowser(r.Header.Get("User-Agent")),
		FirefoxAvailable: assetExists(firefoxAsset),
		ChromeAvailable:  assetExists(chromeAsset),
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := pageTmpl.Execute(w, data); err != nil {
		log.WithError(err).Warn("failed to render setup page")
	}
}

// detectBrowser maps a User-Agent to "firefox", "chromium", or "unknown".
// All Chromium-family browsers (Chrome, Edge, Brave, Opera) use the chrome build.
func detectBrowser(ua string) string {
	switch {
	case strings.Contains(ua, "Firefox") && !strings.Contains(ua, "Seamonkey"):
		return "firefox"
	case strings.Contains(ua, "Edg"),
		strings.Contains(ua, "OPR"),
		strings.Contains(ua, "Chrome"),
		strings.Contains(ua, "Chromium"):
		return "chromium"
	default:
		return "unknown"
	}
}

// openBrowser tries to open url in the default browser. Failure is non-fatal —
// the URL has already been printed for the user to open manually.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		log.Warnf("Don't know how to open a browser on %s - open %s manually", runtime.GOOS, url)
		return
	}
	if err := cmd.Start(); err != nil {
		log.WithError(err).Warnf("Couldn't open a browser automatically - open %s manually", url)
	}
}

type pageData struct {
	Browser          string
	FirefoxAvailable bool
	ChromeAvailable  bool
}

var pageTmpl = template.Must(template.New("setup").Parse(pageHTML))
