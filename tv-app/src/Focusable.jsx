import React from 'react';
import { useFocusable } from '@noriginmedia/norigin-spatial-navigation';

// Botao/item focavel por controle remoto. Enter dispara onPress.
export default function Focusable({ onPress, onFocus, className = '', focusKey, children, autoFocus }) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: onPress,
    onFocus: (layout) => {
      if (ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ block: 'nearest' });
      if (onFocus) onFocus(layout);
    },
  });
  return (
    <div
      ref={ref}
      className={`focusable ${className} ${focused ? 'focused' : ''}`}
      onClick={onPress}
      data-autofocus={autoFocus ? '1' : undefined}
    >
      {children}
    </div>
  );
}
