# Shotback PRD (MVP)

## Problem
Users need quick visual feedback from LLMs on screenshots. Existing workflows are fragmented across capture tools, editors, and sharing steps.

## Goal
Provide a Chrome extension that captures full-page screenshots, links comments to selected areas, and generates a local share URL. Also provide a fallback for external/cloud LLMs that cannot access local URLs.

## Target User
- Solo builders and designers reviewing web pages with LLM assistance.

## MVP Scope
- Full-page capture via scroll + stitch
- Box/arrow/text annotations
- Area-linked comments (single comment editor bound to selected annotation)
- Auto-focus comment editor after drawing area annotations
- Comment timeline (ordered by creation time) with per-item delete
- General feedback field included in shared view
- Local share URL (`chrome-extension://.../viewer.html?share=...`)
- External LLM fallback button: download annotated image + copy structured prompt

## Non-Goals (Current)
- Public/cloud-hosted share URLs by default
- Team collaboration
- Account/auth system

## Success Criteria
- User can capture, annotate, and produce a local share URL in under 1 minute.
- Area comments are clearly tied to selected annotations.
- Shared local viewer reliably shows screenshot + general feedback in same browser profile.
- If local URL is not usable, fallback package for cloud LLMs is generated in one click.

## Constraints
- Local share URLs only work in profiles where extension + local data exist.
