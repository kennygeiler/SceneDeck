import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 18,
          background: "linear-gradient(145deg, #11131c, #1a2030)",
          color: "#f5f7fb",
          fontSize: 32,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 20% 20%, rgba(60, 188, 255, 0.28) 0%, transparent 28%), radial-gradient(circle at 80% 18%, rgba(174, 91, 255, 0.22) 0%, transparent 24%)",
          }}
        />
        <span style={{ position: "relative" }}>🎬</span>
      </div>
    ),
    size,
  );
}
