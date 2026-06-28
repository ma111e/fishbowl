package verdict

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestParseShodanVulns(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{
			name: "object keyed by cve",
			raw:  `{"CVE-2021-0002":{"verified":false},"CVE-2021-0001":{"verified":true}}`,
			want: []string{"CVE-2021-0001", "CVE-2021-0002"},
		},
		{
			name: "flat array",
			raw:  `["CVE-2022-2222","CVE-2022-1111"]`,
			want: []string{"CVE-2022-1111", "CVE-2022-2222"},
		},
		{
			name: "absent",
			raw:  ``,
			want: nil,
		},
		{
			name: "null",
			raw:  `null`,
			want: nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var raw json.RawMessage
			if tc.raw != "" {
				raw = json.RawMessage(tc.raw)
			}
			got := parseShodanVulns(raw)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("parseShodanVulns(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}
