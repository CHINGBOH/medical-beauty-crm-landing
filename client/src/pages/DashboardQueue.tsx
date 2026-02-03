import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const QUEUE_LIST = [
  "ai-content-generation",
  "ai-image-generation",
  "data-sync",
  "trigger-execution",
  "wechat-notification",
];

type QueueStatus = {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
  workers: number;
};

type WsMessage = {
  type: string;
  data?: any;
};

export default function DashboardQueue() {
  const initMutation = trpc.queue.init.useMutation();
  const statusQuery = trpc.queue.status.useQuery();
  const [wsStatus, setWsStatus] = useState<Record<string, QueueStatus>>({});
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(8);
  const [sortKey, setSortKey] = useState<"name" | "waiting" | "active" | "failed">("name");

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/ws/queue-status`;
  }, []);

  useEffect(() => {
    if (!wsUrl) return;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          data: { queueNames: QUEUE_LIST },
        })
      );
      ws.send(
        JSON.stringify({
          type: "get_status",
          data: {},
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        if (msg.type === "queue_status" && msg.data?.status) {
          setWsStatus(msg.data.status);
        }
        if (msg.type === "status" && msg.data?.status) {
          setWsStatus(msg.data.status);
        }
      } catch {
        // ignore
      }
    };

    return () => ws.close();
  }, [wsUrl]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      statusQuery.refetch();
    }, Math.max(3, refreshInterval) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, statusQuery]);

  const mergedStatus = statusQuery.data || wsStatus;
  const filtered = QUEUE_LIST.filter((name) =>
    name.toLowerCase().includes(filter.toLowerCase())
  );
  const sorted = [...filtered].sort((a, b) => {
    const statusMap = mergedStatus as Record<string, QueueStatus>;
    if (sortKey === "name") return a.localeCompare(b);
    const aVal = statusMap?.[a]?.[sortKey] ?? 0;
    const bVal = statusMap?.[b]?.[sortKey] ?? 0;
    return bVal - aVal;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedQueues = sorted.slice((page - 1) * pageSize, page * pageSize);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">队列监控</h1>
            <p className="text-muted-foreground mt-2">
              实时查看异步任务队列状态
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => initMutation.mutate()}
              disabled={initMutation.isPending}
            >
              初始化队列
            </Button>
            <Button variant="outline" onClick={() => statusQuery.refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            placeholder="筛选队列名称..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          />
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="waiting">按 waiting</SelectItem>
              <SelectItem value="active">按 active</SelectItem>
              <SelectItem value="failed">按 failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            自动刷新
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>
          <Input
            type="number"
            min={3}
            max={60}
            className="w-28"
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
          />
          <div className="text-sm text-muted-foreground">秒</div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} / {QUEUE_LIST.length}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {pagedQueues.map((name) => {
            const status = (mergedStatus as Record<string, QueueStatus>)?.[name];
            return (
              <Card key={name}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-sm font-medium">{name}</CardTitle>
                    <CardDescription>队列状态</CardDescription>
                  </div>
                  <Activity className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {status ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">waiting {status.waiting}</Badge>
                        <Badge variant="outline">active {status.active}</Badge>
                        <Badge variant="outline">completed {status.completed}</Badge>
                        <Badge variant="outline">failed {status.failed}</Badge>
                        <Badge variant="outline">delayed {status.delayed}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        workers: {status.workers} · {status.isPaused ? "paused" : "running"}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">暂无状态</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <div className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            下一页
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
