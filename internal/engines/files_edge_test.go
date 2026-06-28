package engines

import (
	"testing"

	"github.com/ma111e/fishbowl/internal/models"
)

func TestFilesEngineNegativeCases(t *testing.T) {
	input := `
Let's make sure these don't get matched:
Unix extensionless: /usr/bin/python
Windows extensionless: C:\Windows\System32\cmd
Disallowed extension: a nice picture.jpg
Another disallowed: an unrelated.png file
Prose: just a normal sentence with no files.
Too long extension: executable.superlongextension
Bad extension: NotAName.exe123
URL with disallowed ext: https://google.com/index.html
`

	engine := &FilesEngine{}
	res := engine.Process(input)

	entities, ok := res.([]models.FileEntity)
	if !ok {
		t.Fatalf("Expected []models.FileEntity, got %T", res)
	}

	if len(entities) > 0 {
		t.Errorf("Expected 0 entities, got %d. Entities: %+v", len(entities), entities)
	}
}

func TestFilesEngineProseConsumption(t *testing.T) {
	// Regression test: the space-allowing regex branch must NOT greedily
	// consume long runs of prose that happen to end with a file extension.
	input := `
Windows 4696 A primary token was assigned to process Windows 4697 A service was installed in the system Windows 4698 A scheduled task was created Windows 4699 A scheduled task was deleted.cmd
Also some other prose about network security analysis that eventually mentions a file.dat somewhere in the middle of a long sentence about various topics and technologies.
`

	engine := &FilesEngine{}
	res := engine.Process(input)

	entities, ok := res.([]models.FileEntity)
	if !ok {
		t.Fatalf("Expected []models.FileEntity, got %T", res)
	}

	for _, e := range entities {
		// No single entity should be unreasonably long (>80 chars is suspicious for a filename)
		if len(e.File) > 80 {
			t.Errorf("Matched prose as filename (%d chars): %q", len(e.File), e.File)
		}
	}
}
