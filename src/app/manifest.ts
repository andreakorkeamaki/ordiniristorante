import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Sagretta",
    short_name: "La Sagretta",
    description: "Menu e comande in tempo reale.",
    start_url: "/staff",
    display: "standalone",
    background_color: "#f5edde",
    theme_color: "#8e211d",
    lang: "it",
    orientation: "any",
  };
}
