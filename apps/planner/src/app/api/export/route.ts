import { NextRequest, NextResponse } from "next/server";
import { requireApiContext, requirePro } from "@/lib/api-context";
import { ApiError, handleApiError } from "@/lib/http";
import { bucketToCsv, goalsToCsv } from "@/lib/export";
import { listBucketItems, listGoals } from "@/lib/planner";

export async function GET(request: NextRequest) {
  try {
    const context = await requireApiContext("viewer");
    requirePro(
      context.entitlements,
      "Data export is a Pro feature. Upgrade to download your planner.",
    );

    const format = request.nextUrl.searchParams.get("format") ?? "json";
    const dataset = request.nextUrl.searchParams.get("dataset") ?? "all";
    if (!["json", "csv"].includes(format)) throw new ApiError("Unsupported format", 400);
    if (!["all", "goals", "bucket"].includes(dataset)) {
      throw new ApiError("Unsupported dataset", 400);
    }

    const year = new Date().getFullYear();
    const goals = await listGoals(context.workspace.id, year);
    const bucket = await listBucketItems(context.workspace.id);
    const baseName = `northstar-${context.workspace.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    if (format === "json") {
      const body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          workspace: { id: context.workspace.id, name: context.workspace.name },
          year,
          goals,
          bucketList: bucket,
        },
        null,
        2,
      );
      return new NextResponse(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${baseName}.json"`,
        },
      });
    }

    const csv =
      dataset === "goals"
        ? goalsToCsv(goals)
        : dataset === "bucket"
          ? bucketToCsv(bucket)
          : [goalsToCsv(goals), "", bucketToCsv(bucket)].join("\n");
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}-${dataset}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
