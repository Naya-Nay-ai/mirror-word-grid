"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type ChangeEvent } from "react";

import type { Player } from "../../game-rules";
import { credentialForRoom } from "../../room-client-storage";
import { TEAM_CHAT_MAX_IMAGE_BYTES, TEAM_CHAT_TEXT_LIMIT, type PublicTeamChatMessage, type TeamChatView } from "../../team-chat";
import styles from "./team-mini-chat.module.css";

const INTRO_SEEN_KEY = "mirror-word-grid-mini-chat-intro-seen-v1";

type ChatApiResponse = {
  chatView?: TeamChatView;
  error?: { code?: string; message?: string };
};

function timeLabel(value: number) {
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function countText(value: string) {
  return Array.from(value).length;
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("image_decode_failed"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressScreenshot(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでね。");
  const image = await loadImage(file);

  async function render(maxDimension: number, quality: number) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を処理できませんでした。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, "image/webp", quality);
    if (!blob) throw new Error("画像を処理できませんでした。");
    return new File([blob], "screenshot.webp", { type: blob.type || "image/webp" });
  }

  let output = await render(1600, 0.84);
  if (output.size > TEAM_CHAT_MAX_IMAGE_BYTES) output = await render(1200, 0.72);
  if (output.size > TEAM_CHAT_MAX_IMAGE_BYTES) throw new Error("画像を2MB以下にできなかったよ。少し小さくしてもう一度試してね。");
  return output;
}

export default function TeamMiniChat({ roomId }: { roomId: string }) {
  const [token, setToken] = useState("");
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [showIntroBadge, setShowIntroBadge] = useState(false);
  const [messages, setMessages] = useState<PublicTeamChatMessage[]>([]);
  const [you, setYou] = useState<Player | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<Player, string>>({ O: "O", X: "X" });
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [lastSeenId, setLastSeenId] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const imageUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    setShowIntroBadge(window.localStorage.getItem(INTRO_SEEN_KEY) !== "1");
  }, []);

  useEffect(() => {
    let attempts = 0;
    const readCredential = () => {
      const credential = credentialForRoom(roomId);
      if (credential?.accessToken) {
        setToken(credential.accessToken);
        return true;
      }
      attempts += 1;
      return attempts > 30;
    };
    if (readCredential()) return;
    const timer = window.setInterval(() => {
      if (readCredential()) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [roomId]);

  const applyView = useCallback((view: TeamChatView) => {
    setAvailable(true);
    setMessages(view.messages);
    setYou(view.you);
    setPlayerNames(view.playerNames);
  }, []);

  const pull = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/rooms/${roomId}/chat`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json() as ChatApiResponse;
      if (!response.ok) {
        if (data.error?.code === "team_chat_unavailable") {
          setAvailable(false);
          return;
        }
        throw new Error(data.error?.message || "ミニチャットを読み込めませんでした。");
      }
      if (data.chatView) applyView(data.chatView);
    } catch (cause) {
      if (open) setError(cause instanceof Error ? cause.message : "ミニチャットを読み込めませんでした。");
    }
  }, [applyView, open, roomId, token]);

  useEffect(() => {
    if (!token) return;
    void pull();
    const timer = window.setInterval(() => void pull(), 2_500);
    return () => window.clearInterval(timer);
  }, [pull, token]);

  useEffect(() => {
    if (!open) return;
    const latest = messages.at(-1);
    if (latest) setLastSeenId(latest.id);
  }, [messages, open]);

  useEffect(() => {
    imageUrlsRef.current = imageUrls;
  }, [imageUrls]);

  useEffect(() => () => {
    Object.values(imageUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    const activeIds = new Set(messages.filter((message) => message.hasImage).map((message) => message.id));
    setImageUrls((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const [id, url] of Object.entries(next)) {
        if (!activeIds.has(id)) {
          URL.revokeObjectURL(url);
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : previous;
    });

    if (!token) return;
    for (const message of messages) {
      if (!message.hasImage || imageUrlsRef.current[message.id]) continue;
      void fetch(`/api/rooms/${roomId}/chat/${message.id}/image`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).then(async (response) => {
        if (!response.ok) return;
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageUrls((previous) => {
          if (previous[message.id]) {
            URL.revokeObjectURL(url);
            return previous;
          }
          return { ...previous, [message.id]: url };
        });
      }).catch(() => undefined);
    }
  }, [messages, roomId, token]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const unread = useMemo(() => {
    const latest = messages.at(-1);
    return Boolean(!open && latest && latest.id !== lastSeenId && you && latest.side !== you);
  }, [lastSeenId, messages, open, you]);

  const selectImage = useCallback(async (file: File) => {
    setError("");
    try {
      setImageFile(await compressScreenshot(file));
    } catch (cause) {
      setImageFile(null);
      setError(cause instanceof Error ? cause.message : "画像を処理できませんでした。");
    }
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void selectImage(file);
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(event.clipboardData.items).find((candidate) => candidate.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void selectImage(file);
  };

  const toggleChat = () => {
    if (!open && showIntroBadge) {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
      setShowIntroBadge(false);
    }
    setOpen((value) => !value);
  };

  const send = async () => {
    if (!token || sending || (!text.trim() && !imageFile)) return;
    if (countText(text.trim()) > TEAM_CHAT_TEXT_LIMIT) {
      setError(`メッセージは${TEAM_CHAT_TEXT_LIMIT}文字までだよ。`);
      return;
    }
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      form.set("text", text.trim());
      if (imageFile) form.set("image", imageFile, imageFile.name);
      const response = await fetch(`/api/rooms/${roomId}/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json() as ChatApiResponse;
      if (!response.ok || !data.chatView) throw new Error(data.error?.message || "送信できませんでした。");
      applyView(data.chatView);
      setText("");
      setImageFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "送信できませんでした。");
    } finally {
      setSending(false);
    }
  };

  if (!available) return null;

  return (
    <>
      {open ? (
        <section className={styles.panel} aria-label="対戦ミニチャット">
          <header className={styles.header}>
            <div>
              <h2 className={styles.title}>💬 対戦ミニチャット</h2>
              <p className={styles.helper}>スクショもひとことも、ここでそのまま😏</p>
            </div>
            <button className={styles.close} type="button" onClick={() => setOpen(false)} aria-label="チャットを閉じる">×</button>
          </header>

          <div className={styles.messages}>
            {messages.length === 0 ? <p className={styles.empty}>まだ静か。<br />最初の一撃、どうぞ。</p> : null}
            {messages.map((message) => {
              const mine = message.side === you;
              const sideClass = message.side === "O" ? styles.sideO : styles.sideX;
              return (
                <article className={`${styles.message} ${sideClass} ${mine ? styles.mine : ""}`} key={message.id}>
                  <div className={styles.meta}>
                    <span>{mine ? "あなた" : playerNames[message.side]}</span>
                    <time>{timeLabel(message.sentAt)}</time>
                  </div>
                  {message.text ? <p className={styles.text}>{message.text}</p> : null}
                  {message.hasImage ? (
                    imageUrls[message.id]
                      ? <img className={styles.image} src={imageUrls[message.id]} alt="送信されたスクリーンショット" />
                      : <div className={styles.imageLoading}>画像を読み込み中…</div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className={styles.composer}>
            {previewUrl ? (
              <div className={styles.previewWrap}>
                <img className={styles.preview} src={previewUrl} alt="送信予定の画像" />
                <button className={styles.removeImage} type="button" onClick={() => setImageFile(null)} aria-label="画像を外す">×</button>
              </div>
            ) : null}
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onPaste={handlePaste}
              placeholder="煽り、ツッコミ、ひとこと。スクショは貼り付けでもOK"
              maxLength={TEAM_CHAT_TEXT_LIMIT}
              disabled={sending}
            />
            <div className={styles.actions}>
              <div>
                <button className={styles.attach} type="button" onClick={() => fileInput.current?.click()} disabled={sending}>📎 画像</button>
                <input className={styles.hiddenInput} ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} />
              </div>
              <span className={styles.counter}>{countText(text)}/{TEAM_CHAT_TEXT_LIMIT}</span>
              <button className={styles.send} type="button" onClick={() => void send()} disabled={sending || (!text.trim() && !imageFile)}>
                {sending ? "送信中…" : "送る"}
              </button>
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </section>
      ) : null}

      <button className={`${styles.fab} ${showIntroBadge ? styles.attention : ""}`} type="button" onClick={toggleChat} aria-expanded={open}>
        {showIntroBadge ? <span className={styles.newBadge}>NEW</span> : null}
        <span className={styles.fabCopy}>
          <strong>💬 ミニチャット</strong>
          <small>スクショも送れます</small>
        </span>
        {unread ? <span className={styles.unread} aria-label="新着メッセージ" /> : null}
      </button>
    </>
  );
}
