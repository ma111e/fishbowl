package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/ma111e/fishbowl/internal/api"
	"github.com/ma111e/fishbowl/internal/cli"
	"github.com/ma111e/fishbowl/internal/config"
	"github.com/ma111e/fishbowl/internal/pairing"
	"github.com/ma111e/fishbowl/internal/setup"

	log "github.com/sirupsen/logrus"
)

// version is the build version, overridden at release time via
// -ldflags "-X main.version=<tag>".
var version = "dev"

func main() {
	configureLogging()

	args := os.Args[1:]
	if len(args) == 0 {
		printUsage()
		os.Exit(1)
	}

	switch args[0] {
	case "version", "-v", "--version":
		fmt.Println("fishbowl", version)
	case "server":
		runServer()
	case "setup":
		if err := setup.Run(startBackend); err != nil {
			log.WithField("error", err).Fatal("Setup command failed")
		}
	case "api", "vault":
		if err := cli.Run(args); err != nil {
			log.WithField("error", err).Fatal("CLI command failed")
		}
	default:
		printUsage()
		os.Exit(1)
	}
}

// configureLogging sets the global log level from FISHBOWL_DEBUG. Debug mode is
// verbose and, by design, logs sensitive user data (visited URLs, analyzed
// values), so it warns loudly when enabled. See config.DebugEnvVar.
func configureLogging() {
	if config.DebugEnabled() {
		log.SetLevel(log.DebugLevel)
		log.Warnf("[SECURITY] %s is enabled: debug logs include visited URLs "+
			"(browsing history) and analyzed values. Do not enable this in "+
			"shared or production environments.", config.DebugEnvVar)
	} else {
		log.SetLevel(log.InfoLevel)
	}
}

func printUsage() {
	fmt.Fprintln(os.Stderr, "FishBowl Security Analyzer")
	fmt.Fprintln(os.Stderr, "")
	fmt.Fprintln(os.Stderr, "Usage:")
	fmt.Fprintln(os.Stderr, "  fishbowl server                 Start the analysis backend")
	fmt.Fprintln(os.Stderr, "  fishbowl setup                  Open a local page to install the browser extension")
	fmt.Fprintln(os.Stderr, "  fishbowl api register [service] Register a third-party API key")
	fmt.Fprintln(os.Stderr, "  fishbowl api delete [service]   Delete a registered API key")
	fmt.Fprintln(os.Stderr, "  fishbowl api list               Show fingerprints + last-used dates")
	fmt.Fprintln(os.Stderr, "  fishbowl vault lock             Switch to passphrase-protected mode")
	fmt.Fprintln(os.Stderr, "  fishbowl vault unlock           Switch back to seed mode")
	fmt.Fprintln(os.Stderr, "  fishbowl vault passwd           Change the unlock passphrase")
	fmt.Fprintln(os.Stderr, "  fishbowl version                Print the build version")
}

// startBackend launches the analysis server in-process, unless one is already
// listening on :7158. Non-blocking - used by `fishbowl setup` after install.
func startBackend() {
	if c, err := net.DialTimeout("tcp", "localhost:7158", 200*time.Millisecond); err == nil {
		_ = c.Close()
		log.Info("Backend already running on :7158")
		return
	}
	go runServer()
}

func runServer() {
	// Unlock the vault before serving anything. Seed mode (the default) is
	// silent and auto-initialised on first run; a passphrase vault prompts on
	// stdin. The error already carries any remediation hint.
	if err := config.EnsureOpen(cli.PromptPassphrase("Vault passphrase")); err != nil {
		log.WithError(err).Fatal("[FishBowl] Cannot open vault")
	}

	mux := http.NewServeMux()

	// Protected data routes: require a valid signature from the enrolled
	// extension key (AuthMiddleware also replay-protects and signs responses).
	mux.Handle("/analyze-page", api.AuthMiddleware(http.HandlerFunc(api.HandleAnalyzePage)))
	mux.Handle("/analyze-ip-verdict-from-dom", api.AuthMiddleware(http.HandlerFunc(api.HandleIPVerdictFromDOM)))
	mux.Handle("/capabilities", api.AuthMiddleware(http.HandlerFunc(api.HandleCapabilities)))

	// Pairing endpoints: reachable pre-enrollment, responses still server-signed.
	// /pair enrolls a pubkey with a code; /ping reports pairing state and mints a
	// code when unpaired.
	mux.Handle("/pair", api.SignResponses(http.HandlerFunc(api.HandlePair)))
	mux.Handle("/ping", api.SignResponses(http.HandlerFunc(api.HandlePing)))

	if path, err := api.PubKeyFilePath(); err == nil {
		log.Infof("[FishBowl] Auth pubkey file: %s", path)
	}

	api.InitAuth()

	// If the extension isn't paired yet, mint a fresh pairing code so the user
	// can complete enrollment. If the window lapses, the backend reissues one
	// automatically the next time the extension reaches it.
	if !api.HasEnrolledPubKey() {
		if code, expires, err := pairing.Issue(); err == nil {
			log.Infof("[FishBowl] No extension paired yet. Enter this pairing code to enrol the current web extension: %s (valid %s)", code, time.Until(expires).Round(time.Second))
		}
	}

	server := &http.Server{
		Addr:              "localhost:7158",
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Info("FishBowl Security Analyzer Backend")
	log.Infof("Listening on http://%s", server.Addr)

	if err := server.ListenAndServe(); err != nil {
		log.WithField("error", err).Fatal("Server failed to start")
	}
}
