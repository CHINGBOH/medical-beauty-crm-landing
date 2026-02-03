/**
 * 小红书运营管理页面
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  TrendingUp,
  Trash2,
  Sparkles,
  ImageIcon,
  Loader2,
} from "lucide-react";
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
import { toast } from "sonner";

export default function DashboardXiaohongshu() {
  const [activeTab, setActiveTab] = useState("published");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingPost, setViewingPost] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedFormatted, setCopiedFormatted] = useState(false);
  const [generateOptions, setGenerateOptions] = useState({
    type: "project",
    tone: "enthusiastic",
    project: "",
    keywords: "",
    imageStyle: "modern",
    imageCount: 1,
    model: "auto",
  });
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    tags: "",
    images: "",
    contentType: "项目体验",
    project: "",
    status: "draft",
    scheduledAt: "",
  });

  const imageList = useMemo(
    () =>
      formData.images
        ? formData.images.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
    [formData.images]
  );

  // 获取统计数据
  const { data: stats, isLoading: statsLoading } = trpc.xiaohongshu.getStats.useQuery();

  // 获取内容列表
  const { data: postsData, isLoading: postsLoading, refetch } = trpc.xiaohongshu.getPosts.useQuery({
    status: activeTab as any,
    limit: 20,
    offset: 0,
  });

  const posts = postsData?.posts || [];
  const filteredPosts = posts.filter((post) => {
    const keyword = searchTerm.toLowerCase();
    const matchesText =
      post.title?.toLowerCase().includes(keyword) ||
      post.content?.toLowerCase().includes(keyword) ||
      post.project?.toLowerCase().includes(keyword);
    const matchesStatus = filterStatus === "all" ? true : post.status === filterStatus;
    return matchesText && matchesStatus;
  });

  const highlight = (text: string) => {
    if (!searchTerm.trim()) return text;
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      regex.test(part) ? (
        <mark key={idx} className="bg-yellow-100 text-yellow-900 px-1 rounded">
          {part}
        </mark>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };
  const createMutation = trpc.xiaohongshu.createPost.useMutation({
    onSuccess: () => {
      toast.success("内容创建成功");
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("创建失败", { description: error.message });
    },
  });

  const updateMutation = trpc.xiaohongshu.updatePost.useMutation({
    onSuccess: () => {
      toast.success("内容更新成功");
      refetch();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error("更新失败", { description: error.message });
    },
  });
  const deleteMutation = trpc.xiaohongshu.deletePost.useMutation({
    onSuccess: () => {
      toast.success("已删除内容");
      refetch();
    },
    onError: (error: any) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  const generateContentMutation = trpc.content.generate.useMutation({
    onSuccess: (data) => {
      setFormData((prev) => ({
        ...prev,
        title: data.title || prev.title,
        content: data.content || prev.content,
        tags: Array.isArray(data.tags) ? data.tags.join(",") : prev.tags,
      }));
      toast.success("已生成文案");
    },
    onError: (error: any) => {
      toast.error("生成失败", { description: error.message });
    },
  });

  const generateImageMutation = trpc.content.generateImage.useMutation({
    onError: (error: any) => {
      toast.error("图片生成失败", { description: error.message });
    },
  });

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      title: "",
      content: "",
      tags: "",
      images: "",
      contentType: "项目体验",
      project: "",
      status: "draft",
      scheduledAt: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (post: any) => {
    setEditingId(post.id);
    setFormData({
      title: post.title || "",
      content: post.content || "",
      tags: Array.isArray(post.tags) ? post.tags.join(",") : post.tags || "",
      images: Array.isArray(post.images) ? post.images.join(",") : post.images || "",
      contentType: post.contentType || "项目体验",
      project: post.project || "",
      status: post.status || "draft",
      scheduledAt: post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : "",
    });
    setDialogOpen(true);
  };

  const openView = (post: any) => {
    setViewingPost(post);
    setViewOpen(true);
  };

  const handleCopy = () => {
    if (!viewingPost) return;
    const text = [
      viewingPost.title,
      viewingPost.content,
      Array.isArray(viewingPost.tags) ? viewingPost.tags.join(" ") : viewingPost.tags || "",
    ]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("已复制内容");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyFormatted = () => {
    if (!viewingPost) return;
    const tags = Array.isArray(viewingPost.tags)
      ? viewingPost.tags.map((t: string) => (t.startsWith("#") ? t : `#${t}`)).join(" ")
      : viewingPost.tags || "";
    const text = [
      viewingPost.title,
      viewingPost.content,
      tags,
      "——",
      "欢迎评论/私信了解更多项目与价格～",
    ]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopiedFormatted(true);
    toast.success("已复制为小红书发布格式");
    setTimeout(() => setCopiedFormatted(false), 1500);
  };

  const handleSubmit = () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("标题和正文不能为空");
      return;
    }

    const payload = {
      title: formData.title,
      content: formData.content,
      tags: formData.tags
        ? formData.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      images: formData.images
        ? formData.images.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      contentType: formData.contentType,
      project: formData.project || undefined,
      status: formData.status as any,
      scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt) : undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleGenerateContent = () => {
    const keywords = generateOptions.keywords
      ? generateOptions.keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean)
      : undefined;
    generateContentMutation.mutate({
      type: generateOptions.type as any,
      project: generateOptions.project || undefined,
      keywords,
      tone: generateOptions.tone as any,
    });
  };

  const handleGenerateImages = async () => {
    if (!formData.title || !formData.content) {
      toast.error("请先生成或填写标题与正文");
      return;
    }
    const tasks = Array.from({ length: generateOptions.imageCount }, () =>
      generateImageMutation.mutateAsync({
        title: formData.title,
        content: formData.content,
        project: generateOptions.project || formData.project || undefined,
        style: generateOptions.imageStyle as any,
      })
    );
    const results = await Promise.all(tasks);
    const urls = results.map((r) => r.url).filter(Boolean);
    setFormData((prev) => ({
      ...prev,
      images: [...(prev.images ? prev.images.split(",").map((t) => t.trim()) : []), ...urls].join(
        ","
      ),
    }));
    toast.success("图片已生成");
  };

  const handleApplyOptions = () => {
    const typeMap: Record<string, string> = {
      project: "项目体验",
      case: "效果对比",
      price: "价格揭秘",
      guide: "避坑指南",
      holiday: "节日营销",
    };
    setFormData((prev) => ({
      ...prev,
      project: generateOptions.project || prev.project,
      contentType: typeMap[generateOptions.type] || prev.contentType,
      tags: prev.tags || generateOptions.keywords,
    }));
    toast.success("已同步到表单");
  };

  const handleDelete = (id: number) => {
    if (!confirm("确定要删除该内容吗？")) return;
    deleteMutation.mutate({ id });
  };

  return (
    <DashboardLayout>
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">小红书运营管理</h1>
          <p className="text-muted-foreground mt-2">管理小红书内容发布、数据监控和评论互动</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          创建新内容
        </Button>
      </div>

      {/* 数据统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>已发布内容</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPosts || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              总阅读量
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalViews || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Heart className="w-4 h-4" />
              总点赞数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalLikes || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              总评论数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalComments || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>待回复评论</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.pendingComments || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索与筛选 */}
      <div className="flex flex-col md:flex-row gap-3">
        <Input
          placeholder="搜索标题/项目/正文..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="published">已发布</SelectItem>
            <SelectItem value="scheduled">待发布</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="deleted">已删除</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 内容列表 */}
      <Card>
        <CardHeader>
          <CardTitle>内容管理</CardTitle>
          <CardDescription>查看和管理所有小红书内容</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="published">已发布</TabsTrigger>
              <TabsTrigger value="scheduled">待发布</TabsTrigger>
              <TabsTrigger value="draft">草稿</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="space-y-4 mt-4">
              {postsLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无内容</div>
              ) : (
                <div className="space-y-4">
                  {filteredPosts.map((post) => (
                    <Card key={post.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {highlight(post.title || "")}
                              </h3>
                              <Badge variant="outline">{post.contentType}</Badge>
                              {post.project && <Badge variant="secondary">{post.project}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                              {highlight(post.content || "")}
                            </p>
                            
                            {post.status === "published" && (
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Eye className="w-4 h-4" />
                                  {post.viewCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart className="w-4 h-4" />
                                  {post.likeCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="w-4 h-4" />
                                  {post.commentCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Share2 className="w-4 h-4" />
                                  {post.shareCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Bookmark className="w-4 h-4" />
                                  {post.collectCount}
                                </span>
                              </div>
                            )}

                            {post.status === "scheduled" && post.scheduledAt && (
                              <div className="text-sm text-muted-foreground">
                                计划发布时间：{new Date(post.scheduledAt).toLocaleString("zh-CN")}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(post)}>
                              编辑
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openView(post)}>
                              查看详情
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDelete(post.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 爆款分析 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            爆款内容分析
          </CardTitle>
          <CardDescription>分析表现最好的内容，总结成功经验</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            功能开发中，敬请期待...
          </div>
        </CardContent>
      </Card>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑内容" : "创建新内容"}</DialogTitle>
            <DialogDescription>填写内容并保存为草稿或直接发布</DialogDescription>
          </DialogHeader>

          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                智能生成选项
              </CardTitle>
              <CardDescription>选择模板与风格，一键生成文案与配图</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>文案模板</Label>
                  <Select
                    value={generateOptions.type}
                    onValueChange={(v) => setGenerateOptions({ ...generateOptions, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">项目体验</SelectItem>
                      <SelectItem value="case">效果对比</SelectItem>
                      <SelectItem value="price">价格揭秘</SelectItem>
                      <SelectItem value="guide">避坑指南</SelectItem>
                      <SelectItem value="holiday">节日营销</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>文字风格</Label>
                  <Select
                    value={generateOptions.tone}
                    onValueChange={(v) => setGenerateOptions({ ...generateOptions, tone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enthusiastic">热情种草</SelectItem>
                      <SelectItem value="professional">专业权威</SelectItem>
                      <SelectItem value="casual">轻松聊天</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>医美主题</Label>
                  <Input
                    value={generateOptions.project}
                    onChange={(e) =>
                      setGenerateOptions({ ...generateOptions, project: e.target.value })
                    }
                    placeholder="如：超皮秒、水光针"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>关键词（逗号分隔）</Label>
                  <Input
                    value={generateOptions.keywords}
                    onChange={(e) =>
                      setGenerateOptions({ ...generateOptions, keywords: e.target.value })
                    }
                    placeholder="效果对比,术后护理,真实体验"
                  />
                </div>
                <div className="space-y-2">
                  <Label>图片生成模型</Label>
                  <Select
                    value={generateOptions.model}
                    onValueChange={(v) => setGenerateOptions({ ...generateOptions, model: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">智能匹配</SelectItem>
                      <SelectItem value="model-a">模型 A（待定）</SelectItem>
                      <SelectItem value="model-b">模型 B（待定）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>图片风格</Label>
                  <Select
                    value={generateOptions.imageStyle}
                    onValueChange={(v) => setGenerateOptions({ ...generateOptions, imageStyle: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern">现代简约</SelectItem>
                      <SelectItem value="elegant">高奢质感</SelectItem>
                      <SelectItem value="vibrant">活力明亮</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>图片数量</Label>
                  <Select
                    value={String(generateOptions.imageCount)}
                    onValueChange={(v) =>
                      setGenerateOptions({ ...generateOptions, imageCount: Number(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {count} 张
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleGenerateContent}
                    disabled={generateContentMutation.isPending}
                  >
                    {generateContentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    {generateContentMutation.isPending ? "生成中..." : "一键生成文案"}
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={handleGenerateImages}
                  disabled={generateImageMutation.isPending}
                >
                  {generateImageMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ImageIcon className="w-4 h-4 mr-2" />
                  )}
                  {generateImageMutation.isPending ? "生成中..." : "生成配图"}
                </Button>
                <Button variant="ghost" onClick={handleApplyOptions}>
                  同步到表单
                </Button>
                <Badge variant="secondary">支持自动填充标题/正文/标签</Badge>
                <Badge variant="outline">图片模型可后续切换</Badge>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>标题</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="请输入标题"
              />
            </div>
            <div className="space-y-2">
              <Label>项目</Label>
              <Input
                value={formData.project}
                onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                placeholder="如：超皮秒"
              />
            </div>
            <div className="space-y-2">
              <Label>内容类型</Label>
              <Select
                value={formData.contentType}
                onValueChange={(v) => setFormData({ ...formData, contentType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="项目体验">项目体验</SelectItem>
                  <SelectItem value="效果对比">效果对比</SelectItem>
                  <SelectItem value="价格揭秘">价格揭秘</SelectItem>
                  <SelectItem value="避坑指南">避坑指南</SelectItem>
                  <SelectItem value="节日营销">节日营销</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>状态</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="scheduled">待发布</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>正文</Label>
            <Textarea
              rows={6}
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="请输入正文"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>标签（逗号分隔）</Label>
              <Input
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="#医美,#超皮秒"
              />
            </div>
            <div className="space-y-2">
              <Label>图片链接（逗号分隔）</Label>
              <Input
                value={formData.images}
                onChange={(e) => setFormData({ ...formData, images: e.target.value })}
                placeholder="https://... , https://..."
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>已添加 {imageList.length} 张图片</span>
                {imageList.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData({ ...formData, images: "" })}
                  >
                    清空图片
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>定时发布时间</Label>
            <Input
              type="datetime-local"
              value={formData.scheduledAt}
              onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>内容详情</DialogTitle>
            <DialogDescription>只读模式</DialogDescription>
          </DialogHeader>
          {viewingPost ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? "已复制" : "复制内容"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyFormatted}>
                  {copiedFormatted ? "已复制" : "一键复制发布格式"}
                </Button>
              </div>
              <div><span className="font-medium">标题：</span>{viewingPost.title}</div>
              <div><span className="font-medium">项目：</span>{viewingPost.project || "-"}</div>
              <div><span className="font-medium">类型：</span>{viewingPost.contentType}</div>
              <div><span className="font-medium">状态：</span>{viewingPost.status}</div>
              <div><span className="font-medium">正文：</span><div className="whitespace-pre-wrap">{viewingPost.content}</div></div>
              <div><span className="font-medium">标签：</span>{Array.isArray(viewingPost.tags) ? viewingPost.tags.join(", ") : viewingPost.tags || "-"}</div>
              <div><span className="font-medium">图片：</span>{Array.isArray(viewingPost.images) ? viewingPost.images.join(", ") : viewingPost.images || "-"}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">暂无内容</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
