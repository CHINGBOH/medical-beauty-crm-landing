import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, Activity, Cloud, Plus, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function DashboardTriggers() {
  const [selectedType, setSelectedType] = useState<"time" | "behavior" | "weather" | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "time" as "time" | "behavior" | "weather",
    description: "",
    condition: "",
    action: "",
    enabled: true,
  });

  const { data: triggers, isLoading, refetch } = trpc.triggers.list.useQuery();
  const executeMutation = trpc.triggers.execute.useMutation();
  const deleteMutation = trpc.triggers.delete.useMutation();
  const createMutation = trpc.triggers.create.useMutation({
    onSuccess: () => {
      toast.success("触发器创建成功");
      refetch();
      setDialogOpen(false);
      setFormData({
        name: "",
        type: "time",
        description: "",
        condition: "",
        action: "",
        enabled: true,
      });
    },
    onError: (error: any) => {
      toast.error("创建失败", { description: error.message });
    },
  });
  const generateConditionMutation = trpc.triggers.generateCondition.useMutation({
    onSuccess: (data) => {
      setFormData((prev) => ({
        ...prev,
        condition: JSON.stringify(data, null, 2),
      }));
      toast.success("条件已生成");
    },
    onError: (error: any) => {
      toast.error("生成失败", { description: error.message });
    },
  });
  const generateActionMutation = trpc.triggers.generateCondition.useMutation({
    onSuccess: (data) => {
      setFormData((prev) => ({
        ...prev,
        action: JSON.stringify(data, null, 2),
      }));
      toast.success("动作已生成");
    },
    onError: (error: any) => {
      toast.error("生成失败", { description: error.message });
    },
  });

  const filteredTriggers = triggers?.filter(
    (t) => selectedType === "all" || t.type === selectedType
  );

  const handleExecute = async (id: number) => {
    try {
      const result = await executeMutation.mutateAsync({ id });
      toast.success("触发器执行成功", {
        description: result.result,
      });
      refetch();
    } catch (error: any) {
      toast.error("触发器执行失败", {
        description: error.message,
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个触发器吗？")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("触发器已删除");
      refetch();
    } catch (error: any) {
      toast.error("删除失败", {
        description: error.message,
      });
    }
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("请输入触发器名称");
      return;
    }
    if (!formData.condition.trim() || !formData.action.trim()) {
      toast.error("请输入触发条件与动作");
      return;
    }

    createMutation.mutate({
      name: formData.name,
      type: formData.type,
      condition: formData.condition,
      action: formData.action,
      enabled: formData.enabled,
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "time":
        return <Clock className="h-4 w-4" />;
      case "behavior":
        return <Activity className="h-4 w-4" />;
      case "weather":
        return <Cloud className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "time":
        return "时间触发";
      case "behavior":
        return "行为触发";
      case "weather":
        return "天气触发";
      default:
        return type;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">自动化触发器</h1>
          <p className="text-muted-foreground mt-2">
            配置基于时间、行为和天气的自动化营销触发规则
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          创建触发器
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">全部触发器</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{triggers?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">时间触发</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {triggers?.filter((t) => t.type === "time").length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">行为触发</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {triggers?.filter((t) => t.type === "behavior").length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">天气触发</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {triggers?.filter((t) => t.type === "weather").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建触发器</DialogTitle>
            <DialogDescription>
              配置触发条件与动作（JSON 字符串）
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>触发器名称</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="如：节假日回访提醒"
              />
            </div>

            <div className="space-y-2">
              <Label>触发描述（用于 AI 生成）</Label>
              <Textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="例如：节假日当天上午 9 点给 A/B 类客户发送关怀消息"
              />
            </div>

            <div className="space-y-2">
              <Label>触发类型</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time">时间触发</SelectItem>
                  <SelectItem value="behavior">行为触发</SelectItem>
                  <SelectItem value="weather">天气触发</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>触发条件（JSON）</Label>
              <Textarea
                rows={4}
                value={formData.condition}
                onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                placeholder='{"type":"holiday","schedule":"0 9 * * *","target":"A,B"}'
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    generateConditionMutation.mutate({
                      type: formData.type,
                      description: formData.description || formData.name || "根据描述生成触发条件",
                    })
                  }
                  disabled={generateConditionMutation.isPending}
                >
                  {generateConditionMutation.isPending ? "生成中..." : "AI 生成条件"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>动作配置（JSON）</Label>
              <Textarea
                rows={4}
                value={formData.action}
                onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                placeholder='{"type":"send_message","message":"节日关怀提醒"}'
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    generateActionMutation.mutate({
                      type: formData.type,
                      description: formData.description || formData.name || "根据描述生成动作配置",
                    })
                  }
                  disabled={generateActionMutation.isPending}
                >
                  {generateActionMutation.isPending ? "生成中..." : "AI 生成动作"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 筛选按钮 */}
      <div className="flex gap-2">
        <Button
          variant={selectedType === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedType("all")}
        >
          全部
        </Button>
        <Button
          variant={selectedType === "time" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedType("time")}
        >
          <Clock className="h-4 w-4 mr-2" />
          时间触发
        </Button>
        <Button
          variant={selectedType === "behavior" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedType("behavior")}
        >
          <Activity className="h-4 w-4 mr-2" />
          行为触发
        </Button>
        <Button
          variant={selectedType === "weather" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedType("weather")}
        >
          <Cloud className="h-4 w-4 mr-2" />
          天气触发
        </Button>
      </div>

      {/* 触发器列表 */}
      <div className="grid gap-4">
        {filteredTriggers && filteredTriggers.length > 0 ? (
          filteredTriggers.map((trigger) => (
            <Card key={trigger.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getTypeIcon(trigger.type)}
                    <div>
                      <CardTitle className="text-lg">{trigger.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {getTypeLabel(trigger.type)}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={trigger.enabled ? "default" : "secondary"}>
                      {trigger.enabled ? "已启用" : "已禁用"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExecute(trigger.id)}
                      disabled={executeMutation.isPending}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      手动执行
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(trigger.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">触发条件：</span>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                      {trigger.condition}
                    </pre>
                  </div>
                  <div>
                    <span className="text-sm font-medium">执行动作：</span>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                      {trigger.action}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Zap className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {selectedType === "all"
                  ? "还没有创建任何触发器"
                  : `还没有创建${getTypeLabel(selectedType)}触发器`}
              </p>
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                创建第一个触发器
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 使用提示 */}
      <Card>
        <CardHeader>
          <CardTitle>使用提示</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• <strong>时间触发器：</strong>在特定时间自动执行，如生日提醒、节日营销、定时推送等</p>
          <p>• <strong>行为触发器：</strong>根据客户行为自动执行，如浏览未咨询、咨询未预约、预约未到店等</p>
          <p>• <strong>天气触发器：</strong>根据天气变化自动执行，如晴天推送防晒项目、雨天推送室内项目等</p>
          <p>• 点击"手动执行"可以立即测试触发器效果</p>
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
