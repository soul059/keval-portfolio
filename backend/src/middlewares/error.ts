import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Validation failed.", issues: error.issues });
    return;
  }

  if (error instanceof Error) {
    console.error(error);
  }

  res.status(500).json({ message: "Internal server error." });
}
