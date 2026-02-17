import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getLocalShare, type LocalShare } from "@/lib/localStore";
import "./viewer.css";

function ViewerApp(): JSX.Element {
  const [share, setShare] = useState<LocalShare | null>(null);
  const [status, setStatus] = useState("Loading share...");

  useEffect(() => {
    const run = async (): Promise<void> => {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get("share");

      if (!shareId) {
        setStatus("Missing share id in URL.");
        return;
      }

      try {
        const record = await getLocalShare(shareId);
        if (!record) {
          setStatus(
            "Share not found in local storage. This link only works in a browser profile where this extension saved it."
          );
          return;
        }

        setShare(record);
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load share");
      }
    };

    void run();
  }, []);

  if (status) {
    return (
      <main className="viewer-shell">
        <h1>Shotback Share</h1>
        <p>{status}</p>
      </main>
    );
  }

  if (!share) {
    return null;
  }

  return (
    <main className="viewer-shell">
      <h1>Shotback Share</h1>
      <p>
        Source page: <a href={share.pageUrl}>{share.pageUrl}</a>
      </p>
      <p>Saved at: {new Date(share.createdAt).toLocaleString()}</p>
      <p>
        <strong>General feedback:</strong>{" "}
        {share.generalFeedback?.trim() || "No general feedback provided."}
      </p>
      <img src={share.imageDataUrl} alt="Annotated share" className="share-image" />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ViewerApp />);
