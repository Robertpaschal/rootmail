# rootmail — Go SDK

The official Go client for the [rootmail](https://rootmail.io) email API. No
third-party dependencies; Go 1.21+.

```bash
go get github.com/rootmail/rootmail-go
```

## Quickstart

```go
package main

import (
	"context"
	"fmt"
	"log"

	rootmail "github.com/rootmail/rootmail-go"
)

func main() {
	client := rootmail.New("rm_live_...", rootmail.WithBaseURL("https://api.rootmail.io"))

	msg, err := client.Messages.Send(context.Background(), rootmail.SendParams{
		To:      "you@example.com",
		Subject: "Welcome",
		HTML:    "<h1>Hello 👋</h1>",
	})
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(msg.ID, msg.Status)
}
```

Send a saved template instead:

```go
client.Messages.Send(ctx, rootmail.SendParams{
	To:        "you@example.com",
	Template:  "welcome",
	Variables: map[string]any{"name": "Ada"},
})
```

## Services

```
client.Messages       // Send, Get, List, Audit
client.Templates      // List, Get, Create, Update, Delete
client.Contacts       // Create, Delete
client.Lists          // List, Get, Create, Delete, Contacts, AddContact
client.Campaigns      // List, Get, Create, Send, Delete, Analytics
client.Sequences      // List, Get, Create, Enroll, Enrollments, Analytics
client.Suppressions   // List, Add, Check
client.SubTenants     // List, Get, Create, Auth  (per-customer sending domains)
client.Analytics      // Get(windowDays)
client.Deliverability // Get(windowDays)
client.Imports        // Contacts, Suppressions
client.Assistant      // Chat(prompt)
```

Every `Send` is idempotent — a key is generated automatically (or set
`SendParams.IdempotencyKey`), so retries never double-send.

## Sub-tenants

```go
client := rootmail.New("rm_live_...", rootmail.WithSubTenant("subt_123"))
// …all requests now scoped to that customer's sending domain
```

## Errors

```go
_, err := client.Messages.Send(ctx, params)
var apiErr *rootmail.Error
if errors.As(err, &apiErr) {
	fmt.Println(apiErr.Status, apiErr.Code, apiErr.Message) // e.g. 402 feature_locked
}
```

Single-object responses come back as `rootmail.Object` (a `map[string]any` with the
API's snake_case fields); `Messages.Send`/`Get` return a typed `*Message`.
