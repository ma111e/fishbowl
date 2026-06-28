package verdict

import (
	"testing"
)

func TestAnalyzeVirusTotalContent_DomainCard(t *testing.T) {
	html := `<div class="vstack gap-2 my-auto"> <div class="hstack gap-4"> <div class="vstack gap-2 align-self-center text-truncate me-auto"> <div class="text-truncate"> www.example-malicious-site.net <vt-ui-punycode punycode="www.example-malicious-site.net"></vt-ui-punycode> </div> <div class="text-truncate"> <a href="https://www.virustotal.com/gui/domain/example-malicious-site.net"> example-malicious-site.net </a> </div> </div> <div class="vr my-3"></div> <div> <div class="text-body-tertiary">Last Analysis Date</div> <vt-ui-time-ago unixtime="1739655025" data-tooltip-text="2025-02-15 14:30:25 UTC"></vt-ui-time-ago> </div> <div class="vr my-3"></div> </div> <div class="flex-wrap hstack gap-2"> <a class="badge rounded-pill bg-body-tertiary text-body" href="https://www.virustotal.com/gui/search/entity%253Adomain%2520tag%253Adga"> dga </a> </div> </div>`

	result := analyzeVirusTotalContent("www.example-malicious-site.net", html)

	// Should have aliases
	aliases, ok := result.Details["aliases"].([]string)
	if !ok || len(aliases) == 0 {
		t.Fatalf("expected aliases, got %v", result.Details["aliases"])
	}
	found := false
	for _, a := range aliases {
		if a == "www.example-malicious-site.net" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected alias www.example-malicious-site.net, got %v", aliases)
	}

	// Should have Last Analysis Date
	if lad, ok := result.Details["Last Analysis Date"]; !ok || lad != "2025-02-15 14:30:25 UTC" {
		t.Errorf("expected Last Analysis Date = '2025-02-15 14:30:25 UTC', got %v", lad)
	}

	// Should have badges as vtBadge structs
	badgesRaw, ok := result.Details["badges"]
	if !ok {
		t.Fatalf("expected badges, got nil")
	}
	badgeSlice, ok := badgesRaw.([]vtBadge)
	if !ok || len(badgeSlice) == 0 {
		t.Fatalf("expected []vtBadge, got %T: %v", badgesRaw, badgesRaw)
	}
	if badgeSlice[0].Name != "dga" {
		t.Errorf("expected badge name 'dga', got %v", badgeSlice[0].Name)
	}

	// Should NOT have error key (no detection ratio is fine for card view)
	if _, hasErr := result.Details["error"]; hasErr {
		t.Errorf("should not have error key for card view, got %v", result.Details["error"])
	}
}

func TestAnalyzeVirusTotalContent_FileCard(t *testing.T) {
	html := `<div class="vstack gap-2 my-auto" style="min-width:0"> <div class="hstack gap-4"> <div class="vstack gap-2 align-self-center text-truncate"> <div class="file-id text-truncate"><span>a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456</span></div> <div class="file-name text-truncate"> <a>16549004da2c831799d6abda1ee53c9f.virus</a> </div> </div> <div class="vr my-3"></div> <div> <div class="text-body-tertiary">Size</div> <a class="text-nowrap"> 256.75 KB </a> </div> <div class="vr my-3"></div> <div> <div class="text-body-tertiary text-nowrap"> Last Analysis Date </div> <vt-ui-time-ago class="last-analysis-ago text-nowrap" data-tooltip-position="top" data-tooltip-text="2022-09-15 14:30:22 UTC"></vt-ui-time-ago> </div> <div class="vr my-3"></div> </div> <div class="hstack gap-2 flex-wrap"> <a class="badge rounded-pill bg-info-alt text-info-alt" href="#"> peexe </a> <a class="badge rounded-pill bg-body-tertiary text-body" href="#"> assembly </a> <a class="badge rounded-pill bg-body-tertiary text-body" href="#"> overlay </a> <a class="badge rounded-pill bg-body-tertiary text-body" href="#"> runtime-modules </a> <a class="badge rounded-pill bg-body-tertiary text-body" href="#"> direct-cpu-clock-access </a> <a class="badge rounded-pill bg-body-tertiary text-body" href="#"> 64bits </a> <a class="badge rounded-pill bg-body-tertiary text-body" href="#"> persistence </a> </div> </div>`

	result := analyzeVirusTotalContent("a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456", html)

	// File hash
	if fh, ok := result.Details["fileHash"]; !ok || fh != "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456" {
		t.Errorf("expected fileHash, got %v", result.Details["fileHash"])
	}

	// File name
	if fn, ok := result.Details["fileName"]; !ok || fn != "16549004da2c831799d6abda1ee53c9f.virus" {
		t.Errorf("expected fileName = '16549004da2c831799d6abda1ee53c9f.virus', got %v", fn)
	}

	// Size
	if sz, ok := result.Details["Size"]; !ok || sz != "256.75 KB" {
		t.Errorf("expected Size = '256.75 KB', got %v", sz)
	}

	// Last Analysis Date
	if lad, ok := result.Details["Last Analysis Date"]; !ok || lad != "2022-09-15 14:30:22 UTC" {
		t.Errorf("expected Last Analysis Date = '2022-09-15 14:30:22 UTC', got %v", lad)
	}

	// Badges as vtBadge structs
	badgesRaw, ok := result.Details["badges"]
	if !ok {
		t.Fatalf("expected badges, got nil")
	}
	badgeSlice, ok := badgesRaw.([]vtBadge)
	if !ok {
		t.Fatalf("expected []vtBadge, got %T: %v", badgesRaw, badgesRaw)
	}
	expectedBadges := []string{"peexe", "assembly", "overlay", "runtime-modules", "direct-cpu-clock-access", "64bits", "persistence"}
	if len(badgeSlice) != len(expectedBadges) {
		t.Fatalf("expected %d badges, got %d", len(expectedBadges), len(badgeSlice))
	}
	for i, b := range expectedBadges {
		if badgeSlice[i].Name != b {
			t.Errorf("badge[%d]: expected '%s', got '%s'", i, b, badgeSlice[i].Name)
		}
	}

	// No error key
	if _, hasErr := result.Details["error"]; hasErr {
		t.Errorf("should not have error key for card view, got %v", result.Details["error"])
	}
}

func TestAnalyzeVirusTotalContent_BadgeBlacklist(t *testing.T) {
	html := `<div class="flex-wrap hstack gap-2"><a class="badge rounded-pill" href="#">dga</a><a class="badge rounded-pill" href="#">Sign up</a><a class="badge rounded-pill" href="#">sign in</a></div>`
	result := analyzeVirusTotalContent("test", html)
	badgesRaw, ok := result.Details["badges"]
	if !ok {
		t.Fatalf("expected badges")
	}
	badgeSlice := badgesRaw.([]vtBadge)
	if len(badgeSlice) != 1 {
		t.Fatalf("expected 1 badge (sign up/in filtered), got %d: %v", len(badgeSlice), badgeSlice)
	}
	if badgeSlice[0].Name != "dga" {
		t.Errorf("expected 'dga', got '%s'", badgeSlice[0].Name)
	}
}

func TestAnalyzeVirusTotalContent_BadgeTooltips(t *testing.T) {
	html := `<div class="flex-wrap hstack gap-2"><a class="badge rounded-pill" data-tooltip-text=".NET fundamental unit" href="#">assembly</a><a class="badge rounded-pill" href="#">peexe</a></div>`
	result := analyzeVirusTotalContent("test", html)
	badgeSlice := result.Details["badges"].([]vtBadge)
	if len(badgeSlice) != 2 {
		t.Fatalf("expected 2 badges, got %d", len(badgeSlice))
	}
	if badgeSlice[0].Tooltip != ".NET fundamental unit" {
		t.Errorf("expected tooltip '.NET fundamental unit', got '%s'", badgeSlice[0].Tooltip)
	}
	if badgeSlice[1].Tooltip != "" {
		t.Errorf("expected empty tooltip for peexe, got '%s'", badgeSlice[1].Tooltip)
	}
}

func TestAnalyzeVirusTotalContent_NoAliasConcat(t *testing.T) {
	// Parent div.text-truncate wrapping child div.file-id.text-truncate and div.file-name.text-truncate
	// should NOT produce a concatenated alias like "hash filename"
	html := `<div class="vstack gap-2 align-self-center text-truncate">
		<div class="file-id text-truncate">ff22f4b707ddbbbf79933e22fd6dd921cbbc0056dc36c8b34cc6340bb749501e</div>
		<div class="file-name text-truncate"><a>16549004da2c831799d6abda1ee53c9f.virus</a></div>
	</div>`
	result := analyzeVirusTotalContent("test", html)
	aliases, ok := result.Details["aliases"].([]string)
	if !ok {
		t.Fatalf("expected aliases, got %v", result.Details["aliases"])
	}
	for _, a := range aliases {
		if a == "ff22f4b707ddbbbf79933e22fd6dd921cbbc0056dc36c8b34cc6340bb749501e 16549004da2c831799d6abda1ee53c9f.virus" {
			t.Errorf("should not have concatenated alias, got %q", a)
		}
	}
	// Should have the individual aliases
	foundHash := false
	foundName := false
	for _, a := range aliases {
		if a == "ff22f4b707ddbbbf79933e22fd6dd921cbbc0056dc36c8b34cc6340bb749501e" {
			foundHash = true
		}
		if a == "16549004da2c831799d6abda1ee53c9f.virus" {
			foundName = true
		}
	}
	if !foundHash {
		t.Errorf("expected hash alias, got %v", aliases)
	}
	if !foundName {
		t.Errorf("expected filename alias, got %v", aliases)
	}
}

func TestAnalyzeVirusTotalContent_UnwantedLabelsFiltered(t *testing.T) {
	html := `<div><div class="text-body-tertiary">4 months ago</div><span>Some Article Title</span></div><div><div class="text-body-tertiary">Last Analysis Date</div><vt-ui-time-ago data-tooltip-text="2025-01-01 00:00:00 UTC"></vt-ui-time-ago></div>`
	result := analyzeVirusTotalContent("test", html)
	if _, has := result.Details["4 months ago"]; has {
		t.Errorf("should not have parsed '4 months ago' label")
	}
	if lad, ok := result.Details["Last Analysis Date"]; !ok || lad != "2025-01-01 00:00:00 UTC" {
		t.Errorf("expected Last Analysis Date, got %v", lad)
	}
}
