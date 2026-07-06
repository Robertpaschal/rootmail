package rootmail

import (
	"encoding/json"
	"fmt"
)

// Error is returned when the API responds with a non-2xx status (or is unreachable,
// in which case Status is 0).
type Error struct {
	Status  int    // HTTP status code (0 when the API is unreachable)
	Code    string // rootmail error code, e.g. "feature_locked"
	Message string // human-readable message
	Raw     []byte // the raw error payload
}

func (e *Error) Error() string {
	if e.Status == 0 {
		return "rootmail: " + e.Message
	}
	return fmt.Sprintf("rootmail: [%d] %s", e.Status, e.Message)
}

func parseError(status int, data []byte) *Error {
	e := &Error{Status: status, Raw: data, Message: fmt.Sprintf("request failed with status %d", status)}
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(data, &envelope) == nil {
		if envelope.Error.Message != "" {
			e.Message = envelope.Error.Message
		}
		if envelope.Error.Code != "" {
			e.Code = envelope.Error.Code
		} else if envelope.Error.Type != "" {
			e.Code = envelope.Error.Type
		}
	}
	return e
}
