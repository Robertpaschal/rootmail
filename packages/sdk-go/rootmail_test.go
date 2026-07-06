package rootmail

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSendBuildsRequest(t *testing.T) {
	var gotMethod, gotPath, gotAuth, gotIdem, gotSubtenant string
	var gotBody map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotIdem = r.Header.Get("Idempotency-Key")
		gotSubtenant = r.Header.Get("X-Rootmail-Subtenant")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"msg_1","object":"message","status":"queued","to":"a@b.com"}`))
	}))
	defer srv.Close()

	c := New("rm_test_x", WithBaseURL(srv.URL), WithSubTenant("subt_9"))
	msg, err := c.Messages.Send(context.Background(), SendParams{
		To: "a@b.com", Template: "welcome", Variables: map[string]any{"name": "Ada"},
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if gotMethod != "POST" || gotPath != "/v1/messages" {
		t.Fatalf("want POST /v1/messages, got %s %s", gotMethod, gotPath)
	}
	if gotAuth != "Bearer rm_test_x" {
		t.Fatalf("auth header wrong: %q", gotAuth)
	}
	if gotIdem == "" {
		t.Fatalf("expected an auto-generated Idempotency-Key")
	}
	if gotSubtenant != "subt_9" {
		t.Fatalf("expected sub-tenant header, got %q", gotSubtenant)
	}
	if gotBody["template"] != "welcome" {
		t.Fatalf("body missing template: %v", gotBody)
	}
	if msg.ID != "msg_1" || msg.Status != "queued" {
		t.Fatalf("response not decoded: %+v", msg)
	}
}

func TestErrorParsing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(402)
		_, _ = w.Write([]byte(`{"error":{"code":"feature_locked","message":"Upgrade required"}}`))
	}))
	defer srv.Close()

	c := New("rm_test_x", WithBaseURL(srv.URL))
	_, err := c.Campaigns.Analytics(context.Background(), "cmp_1")
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected *Error, got %v", err)
	}
	if apiErr.Status != 402 || apiErr.Code != "feature_locked" || apiErr.Message != "Upgrade required" {
		t.Fatalf("error not parsed: %+v", apiErr)
	}
}
