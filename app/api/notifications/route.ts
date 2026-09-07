import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const session = await getSession();

  if (!session || session.role?.toLowerCase() !== "admin") {
    return NextResponse.json({ message: "غير مصرح" }, { status: 401 });
  }

  const { data: notifications, error } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Notifications GET error:", error);

    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const formattedNotifications = notifications.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    link: n.link,
    isRead: n.isRead,
    created_at: n.created_at,
  }));

  const unreadCount = formattedNotifications.filter((n) => !n.isRead).length;

  return NextResponse.json({
    notifications: formattedNotifications,
    unreadCount,
  });
}

export async function PATCH(request: Request) {
  try {
    const { id, markAll } = await request.json();

    if (markAll) {
      // تحديث كل الإشعارات غير المقروءة لتصبح مقروءة

      const { error } = await supabaseAdmin

        .from("notifications")

        .update({ isRead: true })

        .eq("isRead", false);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,

        message: "تم تعليم جميع الإشعارات كمقروءة",
      });
    }

    if (id) {
      // تحديث إشعار واحد محدد

      const { error } = await supabaseAdmin

        .from("notifications")

        .update({ isRead: true })

        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "طلب غير مكتمل" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "حدث خطأ أثناء تحديث الإشعارات" },

      { status: 500 },
    );
  }
}
