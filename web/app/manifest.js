export default function manifest() {
  return {
    name: "SpotCheck — Live Campus Occupancy",
    short_name: "SpotCheck",
    description: "Crowd-sourced live occupancy for campus locations.",
    start_url: "/",
    display: "standalone",
    background_color: "#14171b",
    theme_color: "#14171b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
