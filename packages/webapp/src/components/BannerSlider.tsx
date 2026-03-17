import { useState, useEffect, useCallback } from "react";
import { useI18n } from "../i18n.js";

export function BannerSlider() {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);

  const slides = [
    { title: t("banner.welcome.title"), text: t("banner.welcome.text") },
    { title: t("banner.tokens.title"), text: t("banner.tokens.text") },
    { title: t("banner.referral.title"), text: t("banner.referral.text") },
  ];

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <div className="banner-slider">
      <div
        className="banner-slider__track"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div key={i} className="banner-slide">
            <div className="banner-slide__title">{slide.title}</div>
            <div className="banner-slide__text">{slide.text}</div>
          </div>
        ))}
      </div>
      <div className="banner-slider__dots">
        {slides.map((_, i) => (
          <button
            key={i}
            className={`banner-slider__dot${i === current ? " banner-slider__dot--active" : ""}`}
            onClick={() => setCurrent(i)}
          />
        ))}
      </div>
    </div>
  );
}
