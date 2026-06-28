// Package cli implements the `fishbowl api …` and `fishbowl vault …`
// subcommands that mutate the encrypted on-disk vault.
package cli

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/ma111e/fishbowl/internal/config"
)

// Run dispatches CLI subcommands. args is os.Args[1:].
func Run(args []string) error {
	if len(args) == 0 {
		return usageErr()
	}
	switch args[0] {
	case "api":
		return runAPI(args[1:])
	case "vault":
		return runVault(args[1:])
	default:
		return usageErr()
	}
}

func usageErr() error {
	return fmt.Errorf("usage: fishbowl <api|vault> …\n" +
		"  api register [service]   - store an API key (prompts)\n" +
		"  api delete   [service]   - remove a stored key\n" +
		"  api list                  - show fingerprint/created/last-used per service\n" +
		"  vault lock                - switch to passphrase-protected mode\n" +
		"  vault unlock              - switch back to machine-bound seed mode\n" +
		"  vault passwd              - change the unlock passphrase")
}

func runAPI(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: fishbowl api <register|delete|list> [service]")
	}
	service := ""
	if len(args) >= 2 {
		service = strings.TrimSpace(strings.ToLower(args[1]))
	}
	switch args[0] {
	case "register":
		return registerAPIKey(service)
	case "delete":
		return deleteAPIKey(service)
	case "list":
		return listAPIKeys()
	default:
		return fmt.Errorf("unknown api subcommand %q", args[0])
	}
}

func runVault(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("usage: fishbowl vault <lock|unlock|passwd>")
	}
	switch args[0] {
	case "lock":
		return cmdLock()
	case "unlock":
		return cmdUnlock()
	case "passwd":
		return cmdPasswd()
	default:
		return fmt.Errorf("unknown vault subcommand %q", args[0])
	}
}

// PromptPassphrase returns a huh-backed PassphrasePrompter that asks the user
// for their vault passphrase on stdin (echo off).
func PromptPassphrase(prompt string) config.PassphrasePrompter {
	return func() ([]byte, error) {
		var s string
		if err := huh.NewInput().
			Title(prompt).
			EchoMode(huh.EchoModePassword).
			Value(&s).
			WithTheme(neutralTheme()).
			Run(); err != nil {
			return nil, err
		}
		return []byte(s), nil
	}
}

// ensureVaultOpen unlocks the vault for the current CLI invocation. In
// passphrase mode this prompts the user. Safe to call when no vault exists yet.
func ensureVaultOpen() error {
	return config.EnsureOpen(PromptPassphrase("Vault passphrase"))
}

func isValidService(service string) bool {
	for _, s := range config.APIKeyServices {
		if s == service {
			return true
		}
	}
	return false
}

func pickService(title string) (string, error) {
	opts := make([]huh.Option[string], 0, len(config.APIKeyServices))
	for _, s := range config.APIKeyServices {
		opts = append(opts, huh.NewOption(s, s))
	}
	var s string
	if err := huh.NewSelect[string]().Title(title).Options(opts...).Value(&s).WithTheme(neutralTheme()).Run(); err != nil {
		return "", err
	}
	return s, nil
}
