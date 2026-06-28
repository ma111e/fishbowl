package cli

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/huh"
	"github.com/ma111e/fishbowl/internal/config"
)

// cmdLock either creates a fresh passphrase-protected vault or converts an
// existing seed-mode vault to passphrase mode.
func cmdLock() error {
	exists := config.VaultExists()

	fmt.Println("\nLocking the vault with a passphrase.")
	fmt.Println("  • You will be prompted at every daemon start.")
	fmt.Println("  • Headless restarts (systemd Restart=on-failure) will require manual unlock.")
	fmt.Println()

	if !exists {
		fmt.Println("(no vault exists yet - initialising a fresh passphrase-protected vault)")
		pass, err := readNewPassphrase()
		if err != nil {
			return err
		}
		defer zero(pass)
		if err := config.InitPassphraseVault(pass); err != nil {
			return err
		}
		fmt.Println("Vault initialised in passphrase mode.")
		return nil
	}

	if err := ensureVaultOpen(); err != nil {
		return err
	}
	if config.ModeNow() == config.ModePassphrase {
		return fmt.Errorf("vault is already passphrase-protected (use `vault passwd` to change)")
	}

	pass, err := readNewPassphrase()
	if err != nil {
		return err
	}
	defer zero(pass)
	if err := config.Lock(pass); err != nil {
		return err
	}
	fmt.Println("Vault is now passphrase-protected.")
	return nil
}

// cmdUnlock switches a passphrase-mode vault back to seed mode.
func cmdUnlock() error {
	if !config.VaultExists() {
		return fmt.Errorf("no vault exists yet - there's nothing to unlock (run `fishbowl api register <service>` to initialise a seed-mode vault)")
	}
	if err := ensureVaultOpen(); err != nil {
		return err
	}
	if config.ModeNow() == config.ModeSeed {
		return fmt.Errorf("vault is already in seed mode")
	}
	var confirmed bool
	if err := huh.NewConfirm().
		Title("Switch back to machine-bound seed mode? (no more passphrase prompts)").
		Value(&confirmed).
		WithTheme(neutralTheme()).
		Run(); err != nil {
		return err
	}
	if !confirmed {
		fmt.Println("Cancelled")
		return nil
	}
	if err := config.Unlock(); err != nil {
		return err
	}
	fmt.Println("Vault is now in seed mode - no passphrase needed at startup.")
	return nil
}

// cmdPasswd rotates the passphrase (passphrase mode only).
func cmdPasswd() error {
	if !config.VaultExists() {
		return fmt.Errorf("no vault exists yet - run `fishbowl vault lock` to create a passphrase-protected vault")
	}
	if err := ensureVaultOpen(); err != nil {
		return err
	}
	if config.ModeNow() != config.ModePassphrase {
		return fmt.Errorf("vault is not in passphrase mode (`vault lock` first)")
	}
	pass, err := readNewPassphrase()
	if err != nil {
		return err
	}
	defer zero(pass)
	if err := config.ChangePassphrase(pass); err != nil {
		return err
	}
	fmt.Println("Passphrase changed.")
	return nil
}

// readNewPassphrase prompts twice and confirms the values match.
func readNewPassphrase() ([]byte, error) {
	var p1, p2 string
	if err := huh.NewInput().
		Title("New passphrase").
		EchoMode(huh.EchoModePassword).
		Validate(func(s string) error {
			if strings.TrimSpace(s) == "" {
				return fmt.Errorf("passphrase cannot be empty")
			}
			if len(s) < 8 {
				return fmt.Errorf("use at least 8 characters")
			}
			return nil
		}).
		Value(&p1).
		WithTheme(neutralTheme()).
		Run(); err != nil {
		return nil, err
	}
	if err := huh.NewInput().
		Title("Confirm passphrase").
		EchoMode(huh.EchoModePassword).
		Validate(func(s string) error {
			if s != p1 {
				return fmt.Errorf("passphrases do not match")
			}
			return nil
		}).
		Value(&p2).
		WithTheme(neutralTheme()).
		Run(); err != nil {
		return nil, err
	}
	return []byte(p1), nil
}

func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
