package engines

import (
	"sort"
	"strconv"
	"sync"

	"github.com/ma111e/fishbowl/internal/models"
)

// Engine defines the interface that all analysis engines must implement
type Engine interface {
	// Name returns the unique name of the engine
	Name() string

	// Analyze extracts entities from textContent into a typed result patch.
	Analyze(textContent string) ResultPatch
}

// ResultPatch is the typed contribution an engine makes to a page analysis.
// Empty fields are ignored when merged into the final response.
type ResultPatch struct {
	IpAddresses   []models.IpAddress
	ASNumbers     []models.ASNumber
	WindowsEvents []models.WindowsEvent
	Domains       []models.Domain
	SID           []models.SID
	Hashes        []models.Hash
	Files         []models.FileEntity
}

// ApplyTo merges a patch into an analysis response.
func (p ResultPatch) ApplyTo(response *models.AnalysisResponse) {
	if p.IpAddresses != nil {
		response.IpAddresses = mergeBy(response.IpAddresses, p.IpAddresses, func(item models.IpAddress) string { return item.IP })
	}
	if p.ASNumbers != nil {
		response.ASNumbers = mergeBy(response.ASNumbers, p.ASNumbers, func(item models.ASNumber) string { return item.Number })
	}
	if p.WindowsEvents != nil {
		response.WindowsEvents = mergeBy(response.WindowsEvents, p.WindowsEvents, func(item models.WindowsEvent) string { return strconv.Itoa(item.EventID) })
	}
	if p.Domains != nil {
		response.Domains = mergeBy(response.Domains, p.Domains, func(item models.Domain) string { return item.Name })
	}
	if p.SID != nil {
		response.SID = mergeBy(response.SID, p.SID, func(item models.SID) string { return item.SID })
	}
	if p.Hashes != nil {
		response.Hashes = mergeBy(response.Hashes, p.Hashes, func(item models.Hash) string { return item.Kind + ":" + item.Value })
	}
	if p.Files != nil {
		response.Files = mergeBy(response.Files, p.Files, func(item models.FileEntity) string { return item.File })
	}
}

func mergeBy[T any](dst []T, src []T, keyFor func(T) string) []T {
	if len(src) == 0 {
		if dst == nil {
			return []T{}
		}
		return dst
	}

	out := make([]T, 0, len(dst)+len(src))
	seen := make(map[string]struct{}, len(dst)+len(src))
	for _, item := range dst {
		key := keyFor(item)
		if key != "" {
			seen[key] = struct{}{}
		}
		out = append(out, item)
	}
	for _, item := range src {
		key := keyFor(item)
		if key != "" {
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
		}
		out = append(out, item)
	}
	return out
}

// EngineRegistry holds all registered analysis engines
var (
	// Engines is a global registry of all analysis engines
	Engines = make(map[string]Engine)

	// mutex for thread-safe engine registration
	enginesMutex sync.RWMutex
)

// RegisterEngine adds an engine to the global registry
func RegisterEngine(engine Engine) {
	enginesMutex.Lock()
	defer enginesMutex.Unlock()

	name := engine.Name()
	Engines[name] = engine

	// For debugging
	// log.Infof("Registered engine: %s", name)
}

// GetEngine retrieves an engine by name
func GetEngine(name string) (Engine, bool) {
	enginesMutex.RLock()
	defer enginesMutex.RUnlock()

	engine, exists := Engines[name]
	return engine, exists
}

// GetAllEngines returns all registered engines in deterministic name order.
func GetAllEngines() []Engine {
	enginesMutex.RLock()
	defer enginesMutex.RUnlock()

	names := make([]string, 0, len(Engines))
	for name := range Engines {
		names = append(names, name)
	}
	sort.Strings(names)

	enginesCopy := make([]Engine, 0, len(names))
	for _, name := range names {
		enginesCopy = append(enginesCopy, Engines[name])
	}

	return enginesCopy
}
