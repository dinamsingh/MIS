import { onRequestOptions as __api_admin_create_teacher_ts_onRequestOptions } from "C:\\MIS 1\\functions\\api\\admin-create-teacher.ts"
import { onRequestPost as __api_admin_create_teacher_ts_onRequestPost } from "C:\\MIS 1\\functions\\api\\admin-create-teacher.ts"
import { onRequestOptions as __api_generate_quiz_ts_onRequestOptions } from "C:\\MIS 1\\functions\\api\\generate-quiz.ts"
import { onRequestPost as __api_generate_quiz_ts_onRequestPost } from "C:\\MIS 1\\functions\\api\\generate-quiz.ts"
import { onRequestOptions as __api_parse_syllabus_pdf_ts_onRequestOptions } from "C:\\MIS 1\\functions\\api\\parse-syllabus-pdf.ts"
import { onRequestPost as __api_parse_syllabus_pdf_ts_onRequestPost } from "C:\\MIS 1\\functions\\api\\parse-syllabus-pdf.ts"

export const routes = [
    {
      routePath: "/api/admin-create-teacher",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_admin_create_teacher_ts_onRequestOptions],
    },
  {
      routePath: "/api/admin-create-teacher",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_create_teacher_ts_onRequestPost],
    },
  {
      routePath: "/api/generate-quiz",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_generate_quiz_ts_onRequestOptions],
    },
  {
      routePath: "/api/generate-quiz",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_generate_quiz_ts_onRequestPost],
    },
  {
      routePath: "/api/parse-syllabus-pdf",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_parse_syllabus_pdf_ts_onRequestOptions],
    },
  {
      routePath: "/api/parse-syllabus-pdf",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_parse_syllabus_pdf_ts_onRequestPost],
    },
  ]