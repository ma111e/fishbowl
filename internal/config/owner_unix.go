//go:build !windows

package config

import (
	"fmt"
	"os"
	"syscall"
)

func requireOwner(info os.FileInfo, path string) error {
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return nil
	}
	if int(st.Uid) != os.Getuid() {
		return fmt.Errorf("%s: owned by uid %d, expected %d - refusing to use", path, st.Uid, os.Getuid())
	}
	return nil
}

func checkFilePerm(mode os.FileMode, path string) error {
	if mode.Perm()&^0o600 != 0 {
		return fmt.Errorf("%s: permissions %o too open - run `chmod 0600 %s`", path, mode.Perm(), path)
	}
	return nil
}

func checkDirPerm(mode os.FileMode, path string) error {
	if mode.Perm()&^0o700 != 0 {
		return fmt.Errorf("%s: directory permissions %o too open - run `chmod 0700 %s`", path, mode.Perm(), path)
	}
	return nil
}
