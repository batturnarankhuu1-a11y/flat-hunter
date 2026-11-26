"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { ChatContext, ChatFlat, ChatReply } from "@/lib/chat"
import { formatMnt } from "@/lib/rent-price"

type Message =
  | { from: "user"; text: string }
  | { from: "bot"; text: string; flats: ChatFlat[]; total: number; suggestions: string[] }

const WELCOME: Message = {
  from: "bot",
  text: "Сайн уу! 😊 Би байр хайхад чинь туслах найз чинь. Ямар байр хайж байна? Дүүрэг, өрөө, үнээ энгийнээр бичээрэй.",
  flats: [],
  total: 0,
  suggestions: ["Баянзүрхэд 2 өрөө 1.5 сая хүртэл", "Хан-Уулд тавилгатай 3 өрөө", "Туслаач"],
}
const STORAGE_KEY = "flat-hunter-chat"

function load(): { messages: Message[]; context: ChatContext | null } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")
    if (saved && Array.isArray(saved.messages)) return saved
  } catch { /* private mode or bad data → start fresh */ }
  return { messages: [WELCOME], context: null }
}

/** Floating chat: friendly Mongolian assistant that searches the listings (POST /api/chat). */
export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [context, setContext] = useState<ChatContext | null>(null)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const restored = useRef(false)

  // A link to "#chat" opens the chat (e.g. from a help text).
  useEffect(() => {
    const openFromHash = () => { if (window.location.hash === "#chat") setOpen(true) }
    openFromHash()
    window.addEventListener("hashchange", openFromHash)
    return () => window.removeEventListener("hashchange", openFromHash)
  }, [])

  useEffect(() => {
    if (!open || restored.current) return
    restored.current = true
    const saved = load()
    // Restoring the session's conversation once, when the panel first opens.
    setMessages(saved.messages)
    setContext(saved.context)
  }, [open])

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
    if (!restored.current) return
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-30), context })) } catch { /* ignore */ }
  }, [messages, context, open])

  async function send(text: string) {
    const message = text.trim()
    if (!message || sending) return
    setInput("")
    setMessages((current) => [...current, { from: "user", text: message }])
    setSending(true)
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, context }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Алдаа гарлаа")
      const reply = data as ChatReply
      setContext(reply.context)
      setMessages((current) => [...current, { from: "bot", text: reply.reply, flats: reply.flats, total: reply.total, suggestions: reply.suggestions }])
    } catch (error) {
      setMessages((current) => [...current, { from: "bot", text: `Өө, ${error instanceof Error ? error.message : "алдаа гарлаа"} 😓 Дахиад бичээд үзээрэй.`, flats: [], total: 0, suggestions: [] }])
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setMessages([WELCOME])
    setContext(null)
  }

  const last = messages.at(-1)
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Байр хайх туслахтай чатлах"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-emerald-800">
          <span aria-hidden="true" className="text-lg leading-none">💬</span> Байр хайх найз
        </button>
      )}
      {open && (
        <section role="dialog" aria-label="Байр хайх туслах чат"
          className="fixed inset-x-3 bottom-3 top-20 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[34rem] sm:w-[24rem]">
          <header className="flex items-center justify-between gap-2 bg-[#102c27] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">Байр хайх найз 🏠</p>
              <p className="text-[11px] text-emerald-100/80">Манай баазын түрээсийн байрнаас хайна</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={reset} className="rounded-lg px-2 py-1 text-xs text-emerald-100 hover:bg-white/10">Шинээр</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Чат хаах" className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-white/10">×</button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6f8f7] px-3 py-3" aria-live="polite">
            {messages.map((message, index) => message.from === "user" ? (
              <p key={index} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-emerald-700 px-3 py-2 text-sm text-white">{message.text}</p>
            ) : (
              <div key={index} className="max-w-[92%] space-y-2">
                <p className="w-fit rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">{message.text}</p>
                {message.flats.map((flat) => (
                  <Link key={flat.id} href={`/flats/${flat.id}`} className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:border-emerald-300">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail, already-optimized local file */}
                    <img src={flat.image} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs font-semibold leading-4 text-slate-900">{flat.title}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{flat.district}{flat.rooms !== null ? ` · ${flat.rooms} өрөө` : ""}{flat.area !== null ? ` · ${flat.area} м²` : ""}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <b className="text-slate-900">{flat.price !== null ? `${formatMnt(flat.price)}/сар` : "Тохиролцоно"}</b>
                        {flat.badge === "cheap" && <span className="rounded bg-emerald-600 px-1 text-[10px] font-bold text-white">Хямд</span>}
                        {flat.previousPrice !== null && <span className="rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-800">↓ Үнэ буурсан</span>}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
            {sending && <p className="w-fit rounded-2xl bg-white px-3 py-2 text-sm text-slate-400 shadow-sm">Хайж байна…</p>}
            <div ref={end} />
          </div>

          {last?.from === "bot" && last.suggestions.length > 0 && !sending && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2">
              {last.suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => send(suggestion)} className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">{suggestion}</button>
              ))}
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); void send(input) }} className="flex gap-2 border-t border-slate-200 p-2">
            <label htmlFor="chat-input" className="sr-only">Мессеж</label>
            <input id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} maxLength={300} placeholder="Юу хайж байна? 🙂" autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            <button type="submit" disabled={sending || !input.trim()} className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">Илгээх</button>
          </form>
        </section>
      )}
    </>
  )
}
