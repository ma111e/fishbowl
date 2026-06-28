# Makefile for FishBowl Extension Build System

# Configuration
SRC_DIR := ./
BUILD_DIR := dist
CHROME_DIR := $(BUILD_DIR)/chrome
FIREFOX_DIR := $(BUILD_DIR)/firefox
MANIFEST_CHROME := $(SRC_DIR)/manifest.chrome.json
MANIFEST_FIREFOX := $(SRC_DIR)/manifest.firefox.json

# List of files to copy (relative to SRC_DIR)
FILES_TO_COPY := \
    js/ \
    html/ \
    styles/ \
    icons/ \
    fonts/ \
    dashboard.html \
    content.js \
    rules.json

# Default target
default: help

all: chrome firefox

# Create build directories
$(BUILD_DIR):
	mkdir -p $(CHROME_DIR) $(FIREFOX_DIR)

# Validate CSS custom-property usage (no dangling var() references)
lint-css:
	@echo "Checking CSS tokens..."
	@python3 tools/check-css-tokens.py || (echo "CSS token check failed. Aborting build." && exit 1)

# Build Chrome extension
chrome: lint-css $(BUILD_DIR)
	@echo "Building Chrome extension..."
	@# Clean Chrome build directory
	@rm -rf $(CHROME_DIR)
	@mkdir -p $(CHROME_DIR)
	@# Create Chrome-specific manifest
	@cp $(MANIFEST_CHROME) $(CHROME_DIR)/manifest.json
	@# Copy all other files
	@for file in $(FILES_TO_COPY); do \
		if [ -d "$(SRC_DIR)/$$file" ]; then \
			mkdir -p "$(CHROME_DIR)/$$file"; \
			cp -r "$(SRC_DIR)/$$file"/* "$(CHROME_DIR)/$$file/"; \
		else \
			mkdir -p "$(CHROME_DIR)/$$(dirname "$$file")"; \
			cp "$(SRC_DIR)/$$file" "$(CHROME_DIR)/$$file"; \
		fi \
	done
	@# Create zip archive
	@(cd $(CHROME_DIR) && zip -r ../fishbowl-chrome.zip .)
	@echo "Chrome extension built at $(BUILD_DIR)/fishbowl-chrome.zip"

# Build Firefox extension
firefox: lint-css $(BUILD_DIR)
	@echo "Building Firefox extension..."
	@# Clean Firefox build directory
	@rm -rf $(FIREFOX_DIR)
	@mkdir -p $(FIREFOX_DIR)
	@# Create Firefox-specific manifest
	@cp $(MANIFEST_FIREFOX) $(FIREFOX_DIR)/manifest.json
	@# Copy all source files (scripts load unbundled via the manifest, same as Chrome)
	@for file in $(FILES_TO_COPY); do \
		if [ -d "$(SRC_DIR)/$$file" ]; then \
			mkdir -p "$(FIREFOX_DIR)/$$file"; \
			cp -r "$(SRC_DIR)/$$file"/* "$(FIREFOX_DIR)/$$file/"; \
		else \
			mkdir -p "$(FIREFOX_DIR)/$$(dirname "$$file")"; \
			cp "$(SRC_DIR)/$$file" "$(FIREFOX_DIR)/$$file"; \
		fi \
	done
	@# Create zip archive (Firefox expects a zip file)
	@(cd $(FIREFOX_DIR) && zip -r ../fishbowl-firefox.xpi .)
	@echo "Firefox extension built at $(BUILD_DIR)/fishbowl-firefox.xpi"

# Install development dependencies
deps:
	@echo "Installing development dependencies..."
	@npm install -g web-ext
	@echo "Development tools installed."

# Run development server for Firefox
run-firefox: firefox
	@echo "Starting Firefox with extension..."
	#	@web-ext run --source-dir=$(FIREFOX_DIR) --firefox=zen
	@web-ext run --source-dir=./dist/firefox/ --start-url "http://localhost:8000"

# Run development server for Chrome
run-chrome: chrome
	@echo "Starting Chrome with extension..."
	@chromium --load-extension=$(CHROME_DIR) --disable-extensions-except=$(CHROME_DIR)

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@echo "Clean complete."

# Show help
help:
	@echo "FishBowl Extension Build System"
	@echo "Available targets:"
	@echo "  all         - Build for all browsers (default)"
	@echo "  chrome      - Build Chrome extension"
	@echo "  firefox     - Build Firefox extension"
	@echo "  deps        - Install development dependencies"
	@echo "  run-chrome  - Run Chrome with the extension loaded"
	@echo "  run-firefox - Run Firefox with the extension loaded"
	@echo "  clean       - Remove build artifacts"
	@echo "  help        - Show this help message"

.PHONY: all chrome firefox lint-css deps run-chrome run-firefox clean help
