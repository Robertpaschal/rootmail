import { match, doesNotMatch } from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SendActivity } from "../components/app/send-activity";
import { StageRail, StageScene } from "../components/app/stage-rail";

test("send motion is decorative and runs only while a request is pending", () => {
  const idle = renderToStaticMarkup(createElement(SendActivity, { pending: false }));
  const pending = renderToStaticMarkup(createElement(SendActivity, { pending: true }));
  doesNotMatch(idle, /ui-send-working/);
  match(pending, /ui-send-working/);
  match(pending, /aria-hidden="true"/);
  doesNotMatch(pending, /delivered|progressbar|aria-valuenow/i);
});

test("a stage's content renders immediately with directional motion, never opacity gating", () => {
  const html = renderToStaticMarkup(createElement(StageScene, { keyId: "review", direction: -1, children: "The complete review is readable" }));
  match(html, /The complete review is readable/);
  match(html, /--ui-scene-x:-8px/);
  match(html, /ui-scene-enter/);
  doesNotMatch(html, /opacity|visibility|hidden/);
});

test("stage navigation retains current-step semantics and reachable controls", () => {
  const html = renderToStaticMarkup(createElement(StageRail, {
    stages: [{ id: "write", label: "Write" }, { id: "review", label: "Review", hint: "Check your email" }, { id: "finish", label: "Finish" }],
    current: 1, furthest: 1, onJump: () => {},
  }));
  match(html, /aria-current="step"/);
  match(html, /Check your email/);
  match(html, /disabled=""/);
  doesNotMatch(html, /opacity:0|visibility:hidden/);
});
