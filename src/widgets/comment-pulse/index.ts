import { defineWidget } from "../types";
import { CommentPulseWidget } from "./CommentPulseWidget";

export default defineWidget({
  id: "comment-pulse",
  title: "Kommentar-Puls",
  description: "Neueste und meistgelikte Kommentare deiner Shorts und die Shorts mit den meisten neuen Kommentaren.",
  size: "medium",
  component: CommentPulseWidget,
});
