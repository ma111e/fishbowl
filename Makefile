.PHONY: build assets release build_win build_lin devload vibe-task-finished

# Build the extension for both browsers and stage the artifacts that the backend
# embeds via go:embed. Requires the web toolchain (python3/zip/npm).
assets:
	cd web && $(MAKE) chrome firefox
	mkdir -p internal/setup/assets
	cp web/dist/fishbowl-chrome.zip internal/setup/assets/
	cp web/dist/fishbowl-firefox.xpi internal/setup/assets/
	cp web/icons/icon-128.png internal/setup/assets/icon.png

# Stage the embedded assets, then compile the binary for Windows and Linux.
release: assets
	GOOS=windows go build -o fishbowl.exe
	go build -o fishbowl .

build_win:
	GOOS=windows go build -o fishbowl.exe	

build_lin:
	go build -o fishbowl .

devload:
	tmux split-window -h -c ~/workspace/fishbowl/dev
	tmux select-pane -t 1
	tmux split-window -v -c ~/workspace/fishbowl/web
	tmux select-pane -t 0
	tmux split-window -v
	tmux send-keys -t 1 'go run main.go server' C-m
	tmux send-keys -t 2 'python3 -m http.server' C-m
	tmux send-keys -t 3 'make run-firefox' C-m


vibe-task-finished:
	@echo 'Task finished, building Firefox extension...'
	@make firefox -C web
