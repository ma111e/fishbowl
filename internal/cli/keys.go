package cli

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/charmbracelet/huh"
	"github.com/ma111e/fishbowl/internal/config"
)

var serviceDisclaimers = map[string]string{
	"virustotal": `VirusTotal usage restrictions: "Must not be used in business workflows, commercial products or services."`,
}

func registerAPIKey(service string) error {
	if err := ensureVaultOpen(); err != nil {
		return err
	}

	if service == "" {
		s, err := pickService("Select a service to register an API key for")
		if err != nil {
			return err
		}
		service = s
	} else if !isValidService(service) {
		return fmt.Errorf("unknown service %q; valid services: %s", service, strings.Join(config.APIKeyServices, ", "))
	}

	if disclaimer, ok := serviceDisclaimers[service]; ok {
		fmt.Printf("\nNote: %s\n\n", disclaimer)
	}

	var key string
	if err := huh.NewInput().
		Title(fmt.Sprintf("Enter API key for %s", service)).
		EchoMode(huh.EchoModePassword).
		Validate(func(s string) error {
			if strings.TrimSpace(s) == "" {
				return fmt.Errorf("API key cannot be empty")
			}
			return nil
		}).
		Value(&key).
		WithTheme(neutralTheme()).
		Run(); err != nil {
		return err
	}

	if err := config.SetKey(service, key); err != nil {
		return fmt.Errorf("failed to save API key: %w", err)
	}
	fmt.Printf("Registered API key for %s\n", service)
	return nil
}

func deleteAPIKey(service string) error {
	if err := ensureVaultOpen(); err != nil {
		return err
	}

	if service == "" {
		s, err := pickService("Select a service to delete the API key for")
		if err != nil {
			return err
		}
		service = s
	} else if !isValidService(service) {
		return fmt.Errorf("unknown service %q; valid services: %s", service, strings.Join(config.APIKeyServices, ", "))
	}

	if !config.HasAPIKey(service) {
		fmt.Printf("No API key registered for %s\n", service)
		return nil
	}

	var confirmed bool
	if err := huh.NewConfirm().
		Title(fmt.Sprintf("Delete API key for %s?", service)).
		Affirmative("Yes, delete it").
		Negative("Cancel").
		Value(&confirmed).
		WithTheme(neutralTheme()).
		Run(); err != nil {
		return err
	}
	if !confirmed {
		fmt.Println("Cancelled")
		return nil
	}

	if err := config.DeleteKey(service); err != nil {
		return fmt.Errorf("failed to delete API key: %w", err)
	}
	fmt.Printf("Deleted API key for %s\n", service)
	return nil
}

// listAPIKeys prints fingerprint + created / last-used metadata. Never the secret.
func listAPIKeys() error {
	if err := ensureVaultOpen(); err != nil {
		return err
	}
	infos, err := config.List()
	if err != nil {
		return err
	}
	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	_, _ = fmt.Fprintln(tw, "SERVICE\tFINGERPRINT\tCREATED\tLAST USED\tENV OVERRIDE")
	for _, i := range infos {
		fp := i.Fingerprint
		created := i.CreatedAt
		used := i.LastUsed
		if fp == "" {
			fp = "—"
			created = "—"
		}
		if used == "" {
			used = "(never)"
		}
		envHint := ""
		if name := config.EnvOverride(i.Source); name != "" {
			if os.Getenv(name) != "" {
				envHint = name + " (set, takes precedence)"
			} else {
				envHint = name
			}
		}
		_, _ = fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\n", i.Source, fp, created, used, envHint)
	}
	return tw.Flush()
}
