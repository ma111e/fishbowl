package cli

import "github.com/charmbracelet/huh"

// neutralTheme returns a monochrome huh theme: grayscale only, with bold
// (uncolored) titles. Avoids huh's default fuchsia/indigo/green accents for a
// professional CLI look.
func neutralTheme() *huh.Theme {
	t := huh.ThemeBase()
	t.Focused.Title = t.Focused.Title.Bold(true)
	t.Blurred.Title = t.Blurred.Title.Bold(true)
	return t
}
