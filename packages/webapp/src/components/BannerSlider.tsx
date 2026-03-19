import { useState, useEffect } from "react";
import { api, API_BASE } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { BannerSlide } from "../types.js";

export function BannerSlider() {
  const { t } = useI18n();
  const [current, setCurrent] = useState(0);
  const [apiSlides, setApiSlides] = useState<BannerSlide[] | null>(null);

  useEffect(() => {
    api.slides
      .list()
      .then((res) => setApiSlides(res.slides))
      .catch(() => setApiSlides([]));
  }, []);

  const fallbackSlides = [
    { title: t("banner.welcome.title"), text: t("banner.welcome.text") },
    { title: t("banner.tokens.title"), text: t("banner.tokens.text") },
    { title: t("banner.referral.title"), text: t("banner.referral.text") },
  ];

  const useApi = apiSlides !== null && apiSlides.length > 0;
  const totalSlides = useApi ? apiSlides.length : fallbackSlides.length;

  // Per-slide duration via setTimeout
  useEffect(() => {
    if (totalSlides <= 1) return;
    const durationMs = useApi ? (apiSlides[current]?.displaySeconds ?? 4) * 1000 : 4000;
    const timer = setTimeout(() => {
      setCurrent((c) => (c + 1) % totalSlides);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [current, totalSlides, useApi, apiSlides]);

  if (totalSlides === 0) return null;

  const handleSlideClick = (slide: BannerSlide) => {
    if (slide.linkUrl) {
      window.open(slide.linkUrl, "_blank");
    }
  };

  return (
    <div className="banner-slider">
      <div className="banner-slider__track" style={{ transform: `translateX(-${current * 100}%)` }}>
        {useApi
          ? apiSlides.map((slide) => (
              <div
                key={slide.id}
                className={`banner-slide banner-slide--image${slide.linkUrl ? "" : ""}`}
                onClick={() => handleSlideClick(slide)}
              >
                <img src={`${API_BASE}${slide.imageUrl}`} alt="" className="banner-slide__image" />
              </div>
            ))
          : fallbackSlides.map((slide, i) => (
              <div key={i} className="banner-slide">
                <div className="banner-slide__title">{slide.title}</div>
                <div className="banner-slide__text">{slide.text}</div>
              </div>
            ))}
      </div>
      <div className="banner-slider__dots">
        {Array.from({ length: totalSlides }, (_, i) => (
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
