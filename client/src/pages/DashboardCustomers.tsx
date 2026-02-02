import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Filter } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { toast } from "sonner";

export default function DashboardCustomers() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">客户管理</h1>
            <p className="text-muted-foreground mt-2">
              客户画像、分层分级、生命周期管理
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              筛选
            </Button>
            <Button onClick={() => toast.info("功能开发中")}>
              <UserPlus className="w-4 h-4 mr-2" />
              添加客户
            </Button>
          </div>
        </div>

        {/* 客户统计 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>总客户数</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>VIP 客户</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>潜力客户</CardDescription>
              <CardTitle className="text-3xl">0</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>流失预警</CardDescription>
              <CardTitle className="text-3xl text-destructive">0</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 客户列表 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              客户列表
            </CardTitle>
            <CardDescription>
              查看和管理所有客户信息
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">功能开发中</p>
              <p className="text-sm">
                客户管理功能正在开发中，敬请期待
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 功能说明 */}
        <Card>
          <CardHeader>
            <CardTitle>即将上线的功能</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">🎯 客户画像</h3>
                <p className="text-sm text-muted-foreground">
                  基于对话历史和消费记录，自动生成客户画像，包括心理动机、消费决策类型、体验敏感度等
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">📊 客户分层</h3>
                <p className="text-sm text-muted-foreground">
                  自动将客户分为 VIP、潜力、普通、流失四个层级，制定差异化营销策略
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">🔔 重要事件</h3>
                <p className="text-sm text-muted-foreground">
                  记录客户的重要生活事件（结婚、求职、产后等），在关键时刻推送相关项目
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2">⚠️ 流失预警</h3>
                <p className="text-sm text-muted-foreground">
                  自动识别90天未消费的客户，触发召回流程，降低客户流失率
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
