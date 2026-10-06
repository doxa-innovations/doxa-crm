"use client";
import { useEffect } from "react";
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      const link = target.closest("a[href]");
      if (
        link &&
        !event.defaultPrevented &&
        !window.confirm("Discard your unsaved changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    type NavigationEvent = Event & {
      canIntercept: boolean;
      navigationType: string;
    };
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    const navigate = (event: Event) => {
      const nav = event as NavigationEvent;
      if (
        nav.navigationType === "traverse" &&
        nav.cancelable &&
        !window.confirm("Discard your unsaved changes?")
      )
        nav.preventDefault();
    };
    navigation?.addEventListener("navigate", navigate);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      navigation?.removeEventListener("navigate", navigate);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  return () => !dirty || window.confirm("Discard your unsaved changes?");
}
