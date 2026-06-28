//go:build windows

package config

import "os"

// On Windows the POSIX uid/permission model doesn't apply; rely on NTFS ACLs.
func requireOwner(_ os.FileInfo, _ string) error  { return nil }
func checkFilePerm(_ os.FileMode, _ string) error { return nil }
func checkDirPerm(_ os.FileMode, _ string) error  { return nil }
