import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { AddContentDialog } from "../components/AddContentDialog.jsx";
import { VideoTable } from "../components/VideoTable.jsx";
import { Button } from "../components/ui/button.jsx";
import { api, emitLibraryChange, onLibraryChange } from "../lib/api.js";

export function VideosPage() {
  const [params] = useSearchParams();
  const [videos, setVideos] = useState(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      api("/api/videos")
        .then((data) => {
          if (!active) return;
          setVideos(data.videos);
          setError("");
        })
        .catch((err) => {
          if (active) setError(err.message);
        });
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => onLibraryChange(() => {
    api("/api/videos")
      .then((data) => setVideos(data.videos))
      .catch((err) => setError(err.message));
  }), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Videos</h1>
          <p className="text-sm text-muted-foreground">Transcripts and blogs saved in this library.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Content
        </Button>
      </div>
      <VideoTable
        videos={videos || []}
        loading={videos === null}
        error={error}
        initialQuery={params.get("q") || ""}
        onReload={() => emitLibraryChange()}
      />
      <AddContentDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
