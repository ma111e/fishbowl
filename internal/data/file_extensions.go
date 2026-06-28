package data

// AllowedFileExtensions is the allowlist of file extensions (lowercase, without a leading dot)
// used by the FilesEngine.
var AllowedFileExtensions = []string{
	"exe", "dll", "msi", "bat", "cmd", "scr", "pif",
	"js", "vbs", "ps1", "hta", "wsf", "py", "sh",
	"docm", "xlsm", "pptm", "doc", "xls", "rtf", "pdf",
	"zip", "rar", "7z", "iso", "img", "cab", "gz", "tar",
	"lnk", "url", "scf",
	"vhd", "vhdx", "dmg",
	"txt", "dat",
}
