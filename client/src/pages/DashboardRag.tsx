import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

export default function DashboardRag() {
  const [question, setQuestion] = useState("");
  const [type, setType] = useState<"customer" | "internal">("customer");

  const askMutation = trpc.rag.ask.useMutation();

  const handleAsk = () => {
    if (!question.trim()) return;
    askMutation.mutate({ question, type });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RAG 问答</h1>
          <p className="text-muted-foreground mt-2">
            基于知识库的智能问答（轻实现）
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>提问</CardTitle>
            <CardDescription>选择知识库类型并输入问题</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">客户问询知识库</SelectItem>
                <SelectItem value="internal">内部管理知识库</SelectItem>
              </SelectContent>
            </Select>

            <Textarea
              placeholder="请输入问题..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
            />

            <Button onClick={handleAsk} disabled={askMutation.isPending}>
              {askMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  查询中...
                </>
              ) : (
                "开始查询"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>回答</CardTitle>
            <CardDescription>来自 RAG 的响应</CardDescription>
          </CardHeader>
          <CardContent>
            {askMutation.data ? (
              <div className="whitespace-pre-wrap text-sm">{askMutation.data.answer}</div>
            ) : (
              <div className="text-muted-foreground text-sm">暂无回答</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
