// Package rootmail is the official Go SDK for the rootmail email API.
//
//	client := rootmail.New("rm_live_...", rootmail.WithBaseURL("https://api.rootmail.io"))
//	msg, err := client.Messages.Send(context.Background(), rootmail.SendParams{
//		To: "you@example.com", Subject: "Welcome", HTML: "<h1>Hi</h1>",
//	})
package rootmail

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultBaseURL = "http://localhost:4000"

// Client talks to the rootmail API. Create one with New.
type Client struct {
	apiKey      string
	baseURL     string
	subTenantID string
	http        *http.Client

	Messages       *MessagesService
	Templates      *TemplatesService
	Contacts       *ContactsService
	Lists          *ListsService
	Campaigns      *CampaignsService
	Sequences      *SequencesService
	Suppressions   *SuppressionsService
	SubTenants     *SubTenantsService
	Analytics      *AnalyticsService
	Deliverability *DeliverabilityService
	Imports        *ImportsService
	Assistant      *AssistantService
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL sets the API base URL (default http://localhost:4000).
func WithBaseURL(u string) Option { return func(c *Client) { c.baseURL = strings.TrimRight(u, "/") } }

// WithSubTenant scopes every request to a sub-tenant (X-Rootmail-Subtenant).
func WithSubTenant(id string) Option { return func(c *Client) { c.subTenantID = id } }

// WithHTTPClient supplies a custom *http.Client.
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.http = h } }

// New returns a Client authenticated with the given API key.
func New(apiKey string, opts ...Option) *Client {
	c := &Client{
		apiKey:  apiKey,
		baseURL: defaultBaseURL,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
	for _, o := range opts {
		o(c)
	}
	c.Messages = &MessagesService{c}
	c.Templates = &TemplatesService{c}
	c.Contacts = &ContactsService{c}
	c.Lists = &ListsService{c}
	c.Campaigns = &CampaignsService{c}
	c.Sequences = &SequencesService{c}
	c.Suppressions = &SuppressionsService{c}
	c.SubTenants = &SubTenantsService{c}
	c.Analytics = &AnalyticsService{c}
	c.Deliverability = &DeliverabilityService{c}
	c.Imports = &ImportsService{c}
	c.Assistant = &AssistantService{c}
	return c
}

type requestOptions struct {
	query          url.Values
	body           any
	idempotencyKey string
}

// do performs a request and decodes the JSON response into out (a pointer), if non-nil.
func (c *Client) do(ctx context.Context, method, path string, opts requestOptions, out any) error {
	u := c.baseURL + path
	if len(opts.query) > 0 {
		u += "?" + opts.query.Encode()
	}

	var reader io.Reader
	if opts.body != nil {
		b, err := json.Marshal(opts.body)
		if err != nil {
			return fmt.Errorf("rootmail: encoding body: %w", err)
		}
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, u, reader)
	if err != nil {
		return fmt.Errorf("rootmail: building request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	if opts.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.subTenantID != "" {
		req.Header.Set("X-Rootmail-Subtenant", c.subTenantID)
	}
	if opts.idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", opts.idempotencyKey)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return &Error{Message: fmt.Sprintf("cannot reach the rootmail API at %s: %v", c.baseURL, err)}
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return parseError(resp.StatusCode, data)
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("rootmail: decoding response: %w", err)
		}
	}
	return nil
}

func newIdempotencyKey() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
