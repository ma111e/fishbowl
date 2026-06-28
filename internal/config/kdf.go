package config

import (
	"os"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	kdfSaltLen   = 16
	kekLen       = 32
	argonThreads = 2

	// Seed mode tuned for ~200ms on a modern laptop.
	seedArgonTime = 3
	seedArgonMem  = 64 * 1024 // 64 MiB

	// Passphrase mode tuned harder - user-chosen secret is much weaker.
	passArgonTime = 4
	passArgonMem  = 128 * 1024 // 128 MiB
)

// deriveSeedKEK mixes the seed file, machine id, and uid through Argon2id.
// Same machine, same uid, same seed → same KEK; moving the file away breaks decryption.
func deriveSeedKEK(seed, salt []byte) []byte {
	material := append([]byte{}, seed...)
	material = append(material, machineID()...)
	material = append(material, []byte(uidString())...)
	return argon2.IDKey(material, salt, seedArgonTime, seedArgonMem, argonThreads, kekLen)
}

// derivePassKEK runs Argon2id on a user passphrase.
func derivePassKEK(passphrase, salt []byte) []byte {
	return argon2.IDKey(passphrase, salt, passArgonTime, passArgonMem, argonThreads, kekLen)
}

// machineID returns a stable per-machine identifier on Linux. Falls back to empty
// on other OSes - the seed file alone still defeats backup-exfil to another host.
func machineID() []byte {
	for _, p := range []string{"/etc/machine-id", "/var/lib/dbus/machine-id"} {
		if b, err := os.ReadFile(p); err == nil {
			return []byte(strings.TrimSpace(string(b)))
		}
	}
	return nil
}

func uidString() string {
	return strings.Join([]string{"uid:", itoa(os.Getuid())}, "")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
