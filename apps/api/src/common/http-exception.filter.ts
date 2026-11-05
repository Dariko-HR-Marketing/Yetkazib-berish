import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "./errors";
import { zodToApiError } from "./validate";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let err: ApiError;
    if (exception instanceof ApiError) err = exception;
    else if (exception instanceof ZodError) err = zodToApiError(exception);
    else if (exception instanceof HttpException) {
      const s = exception.getStatus();
      err = new ApiError(s, s === 404 ? "not_found" : s === 400 ? "validation.failed" : s === 413 ? "validation.failed" : "internal_error");
    } else {
      if (process.env.DEBUG_API_ERRORS) process.stderr.write(`${(exception as Error)?.stack}\n`);
      this.log.error(`Kutilmagan xato: ${(exception as Error)?.message ?? exception}`, (exception as Error)?.stack);
      err = new ApiError(500, "internal_error");
    }
    res.status(err.status).json(err.toBody());
  }
}
