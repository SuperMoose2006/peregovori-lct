// LiveBar.tsx — полоса живых слоёв под композером: микрофон, камера, расшифровка.
//
// ДВА ПРАВИЛА, КОТОРЫЕ ЗДЕСЬ ЗАКРЕПЛЕНЫ.
//
// 1. Микрофон в дуплексе НЕ ВЫКЛЮЧАЕТСЯ. Поэтому здесь нет и не может быть
//    кнопки «зажмите, чтобы говорить» — она была бы враньём об архитектуре.
//    Строка «микрофон активен» стоит на месте всё время, даже пока говорит
//    оппонент: именно поэтому его и можно перебить.
//
// 2. Камера НЕ ПОКАЗЫВАЕТ ВАС постоянно. Человек, видящий себя, начинает
//    следить за собой — и меняется ровно то поведение, которое мы измеряем
//    (docs/modalities-ux.md §3). Самопревью всплывает по клику на чип и
//    закрывается тем же кликом: проверить свет, а не сопровождать партию.
//
// Выключенные слои не оставляют следов: нет полосы — нет и пустого места под
// неё. Это тот же инвариант раскладки, что и у всего остального.
import { useEffect, useRef, useState } from "react";

interface Props {
  /** Голос поднят: микрофон открыт, оппонент озвучивается. */
  voice: boolean;
  /** Камера поднята: чип состояния + доступное самопревью. */
  camera: boolean;
  /** Игрок сейчас говорит — по VAD сервера, а не по локальной громкости. */
  userSpeaking: boolean;
  /** Оппонент сейчас звучит: подсказываем, что его можно перебить. */
  oppSpeaking: boolean;
  /** Промежуточная расшифровка: показывается ДО того, как станет ходом. */
  transcript: string | null;
  /** Мгновенный уровень входа 0..1. Локальный — поэтому без задержки сети. */
  getMicLevel: () => number;
  /** Оборвать реплику оппонента вручную. */
  onInterrupt?: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  labels: {
    micOn: string; hearing: string; interrupt: string;
    inFrame: string; outFrame: string; peekNote: string; peekOpen: string;
  };
}

const BARS = 6;

export function LiveBar({
  voice, camera, userSpeaking, oppSpeaking, transcript,
  getMicLevel, onInterrupt, videoRef, canvasRef, labels,
}: Props) {
  const [peek, setPeek] = useState(false);
  const [level, setLevel] = useState(0);
  // Кадрирование: пока настоящего детектора лица нет, «в кадре» = камера
  // отдаёт поток. Честно — чип говорит про камеру, а не про ваше лицо.
  const inFrame = camera;
  const rafRef = useRef<number | null>(null);

  // Опрос уровня на ~12 кадрах в секунду. Не rAF: полоска из шести делений не
  // становится информативнее от 60 обновлений, а перерисовки стоят реально.
  useEffect(() => {
    if (!voice) return;
    const id = window.setInterval(() => setLevel(getMicLevel()), 80);
    return () => window.clearInterval(id);
  }, [voice, getMicLevel]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (!voice && !camera) return null;

  return (
    <div className="livebar">
      {voice ? (
        <span className={`lb-mic${userSpeaking ? " hot" : ""}`}>
          <i className="lb-dot" />
          {userSpeaking ? labels.hearing : labels.micOn}
          <span className="lb-bars" aria-hidden="true">
            {Array.from({ length: BARS }, (_, i) => {
              // Каждое деление берёт свою полосу уровня, поэтому полоска
              // «наполняется», а не мигает целиком.
              const share = Math.max(0, Math.min(1, level * BARS - i));
              return <i key={i} style={{ height: `${3 + share * 15}px` }} />;
            })}
          </span>
        </span>
      ) : null}

      {camera ? (
        <button
          type="button"
          className={`lb-cam${inFrame ? "" : " out"}`}
          onClick={() => setPeek((p) => !p)}
          aria-expanded={peek}
          title={labels.peekOpen}
        >
          <i className="lb-dot" />
          {inFrame ? labels.inFrame : labels.outFrame}
        </button>
      ) : null}

      {oppSpeaking && onInterrupt ? (
        <button type="button" className="lb-cut" onClick={onInterrupt}>
          {labels.interrupt}
        </button>
      ) : null}

      {transcript ? <span className="lb-tr">{transcript}</span> : null}

      {/* Видеоэлемент живёт здесь ВСЕГДА, когда камера поднята: провайдер медиа
          привязывает к нему поток один раз. Прятать его перемонтированием
          значило бы каждый раз заново просить доступ к камере. */}
      {camera ? (
        <div className={`lb-peek${peek ? " on" : ""}`} aria-hidden={!peek}>
          <video ref={videoRef} muted playsInline autoPlay />
          <canvas ref={canvasRef} hidden />
          <span className="lb-peek-n">{labels.peekNote}</span>
        </div>
      ) : null}
    </div>
  );
}
