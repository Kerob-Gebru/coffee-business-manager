"use client";

import React from "react";

export default function Modal({
  title,
  close,
  closeAriaLabel,
  wide,
  children,
}: {
  title: string;
  close: () => void;
  closeAriaLabel?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={`modal${wide ? " modal-wide" : ""}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={close} aria-label={closeAriaLabel || "Close"}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
