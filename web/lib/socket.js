import { io } from "socket.io-client";
import { API_URL } from "./api";

let socket;

export function getSocket() {
  if (!socket) socket = io(API_URL);
  return socket;
}
