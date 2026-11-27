"use client"

import T from "@/components/T"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useDistrictName, useLocale, useT } from "@/components/preferences"
import type { ChatContext, ChatFlat, ChatReply } from "@/lib/chat"
import type { Locale } from "@/lib/i18n"
import { formatMnt } from "@/lib/rent-price"

type Message =
  | { from: "user"; text: string }
  | { from: "bot"; text: string; flats: ChatFlat[]; total: number; suggestions: string[]; welcome?: boolean }

/** The greeting follows the interface language, so it is rendered from here, not from the stored text. */
const WELCOME_TEXT: Record<Locale, { text: string; suggestions: string[] }> = {
  mn: {
    text: "Сайн уу! 😊 Би байр хайхад чинь туслах найз чинь. Ямар байр хайж байна? Дүүрэг, өрөө, үнээ энгийнээр бичээрэй.",
    suggestions: ["Баянзүрхэд 2 өрөө 1.5 сая хүртэл", "Хан-Уулд тавилгатай 3 өрөө", "Туслаач"],
  },
  en: {
    text: "Hi! 😊 I'm your flat-finding buddy. What are you looking for? Just tell me the district, rooms and budget in plain words.",
    suggestions: ["2 rooms in Bayanzurkh up to 1.5M", "Furnished 3 rooms in Khan-Uul", "Help"],
  },
}
const WELCOME: Message = { from: "bot", text: WELCOME_TEXT.mn.text, flats: [], total: 0, suggestions: WELCOME_TEXT.mn.suggestions, welcome: true }
const STORAGE_KEY = "flat-hunter-chat"

function load(): { messages: Message[]; context: ChatContext | null } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null")
    if (saved && Array.isArray(saved.messages)) return saved
  } catch { /* private mode or bad data → start fresh */ }
  return { messages: [WELCOME], context: null }
}

/** Floating chat: friendly Mongolian / English assistant that searches the listings (POST /api/chat). */
export default function ChatWidget() {
  const locale = useLocale()
  const t = useT()
  const district = useDistrictName()
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
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, context, locale }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? t("Алдаа гарлаа", "something went wrong"))
      const reply = data as ChatReply
      setContext(reply.context)
      setMessages((current) => [...current, { from: "bot", text: reply.reply, flats: reply.flats, total: reply.total, suggestions: reply.suggestions }])
    } catch (error) {
      setMessages((current) => [...current, { from: "bot", text: t(`Өө, ${error instanceof Error ? error.message : "алдаа гарлаа"} 😓 Дахиад бичээд үзээрэй.`, `Oops, ${error instanceof Error ? error.message : "something went wrong"} 😓 Please try again.`), flats: [], total: 0, suggestions: [] }])
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setMessages([WELCOME])
    setContext(null)
  }

  const last = messages.at(-1)
  const lastSuggestions = last?.from === "bot" ? (last.welcome ? WELCOME_TEXT[locale].suggestions : last.suggestions) : []
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label={t("Байр хайх туслахтай чатлах", "Chat with the flat-finding assistant")}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-emerald-800">
          <span aria-hidden="true" className="text-lg leading-none">💬</span> <T mn="Байр хайх найз" en="Flat-finding buddy" />
        </button>
      )}
      {open && (
        <section role="dialog" aria-label={t("Байр хайх туслах чат", "Flat-finding assistant chat")}
          className="fixed inset-x-3 bottom-3 top-20 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:top-auto sm:h-[34rem] sm:w-[24rem]">
          <header className="flex items-center justify-between gap-2 bg-[#102c27] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold"><T mn="Байр хайх найз" en="Flat-finding buddy" /> 🏠</p>
              <p className="text-[11px] text-emerald-100/80"><T mn="Манай баазын түрээсийн байрнаас хайна" en="Searches the rentals in our database" /></p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={reset} className="rounded-lg px-2 py-1 text-xs text-emerald-100 hover:bg-white/10"><T mn="Шинээр" en="Restart" /></button>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Чат хаах", "Close chat")} className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-white/10">×</button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6f8f7] px-3 py-3" aria-live="polite">
            {messages.map((message, index) => message.from === "user" ? (
              <p key={index} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-emerald-700 px-3 py-2 text-sm text-white">{message.text}</p>
            ) : (
              <div key={index} className="max-w-[92%] space-y-2">
                <p className="w-fit rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">{message.welcome ? WELCOME_TEXT[locale].text : message.text}</p>
                {message.flats.map((flat) => (
                  <Link key={flat.id} href={`/flats/${flat.id}`} className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:border-emerald-300">
                    {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnail, already-optimized local file */}
                    <img src={flat.image} alt="" loading="lazy" className="h-16 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-xs font-semibold leading-4 text-slate-900">{flat.title}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{district(flat.district)}{flat.rooms !== null ? ` · ${flat.rooms} ${t("өрөө", flat.rooms === 1 ? "room" : "rooms")}` : ""}{flat.area !== null ? ` · ${flat.area} ${t("м²", "m²")}` : ""}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <b className="text-slate-900">{flat.price !== null ? `${formatMnt(flat.price)}${t("/сар", "/mo")}` : t("Тохиролцоно", "Negotiable")}</b>
                        {flat.badge === "cheap" && <span className="rounded bg-emerald-600 px-1 text-[10px] font-bold text-white"><T mn="Хямд" en="Cheap" /></span>}
                        {flat.previousPrice !== null && <span className="rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-800"><T mn="↓ Үнэ буурсан" en="↓ Price dropped" /></span>}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
            {sending && <p className="w-fit rounded-2xl bg-white px-3 py-2 text-sm text-slate-400 shadow-sm"><T mn="Хайж байна…" en="Searching…" /></p>}
            <div ref={end} />
          </div>

          {lastSuggestions.length > 0 && !sending && (
            <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2">
              {lastSuggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => send(suggestion)} className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">{suggestion}</button>
              ))}
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); void send(input) }} className="flex gap-2 border-t border-slate-200 p-2">
            <label htmlFor="chat-input" className="sr-only"><T mn="Мессеж" en="Message" /></label>
            <input id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} maxLength={300} placeholder={t("Юу хайж байна? 🙂", "What are you looking for? 🙂")} autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" />
            <button type="submit" disabled={sending || !input.trim()} className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><T mn="Илгээх" en="Send" /></button>
          </form>
        </section>
      )}
    </>
  )
}
