// 📄 src/components/LightboxSlide.tsx

import type { Slide, RenderSlideProps } from "yet-another-react-lightbox";
import { useCachedImage } from '../hooks/useCachedImage';
import { useAuth } from '../providers/AuthProvider';

// Наследуем наш тип от базового типа 'Slide' для совместимости
export interface CustomSlide extends Slide {
  id: string;
  path: string;
}

export function LightboxSlide({ slide }: RenderSlideProps<CustomSlide>) {
  const { user } = useAuth();
  const imageUrl = useCachedImage(slide.path, user?.id);

  // Пока URL не загружен, показываем индикатор
  if (!imageUrl) {
    return (
      <div className="yarl__slide_loading">
        <div className="yarl__spinner" />
      </div>
    );
  }

  // Когда URL получен, рендерим изображение
  return (
    <div className="yarl__slide_image_container">
      <img
        className="yarl__slide_image"
        src={imageUrl}
        loading="eager"
        alt="Image slide"
        draggable={false}
      />
    </div>
  );
}