import { PointerEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, Empty, Skeleton, Space, Typography, message } from "antd";
import { CopyOutlined, ReloadOutlined } from "@ant-design/icons";
import { generateKnowledgeTree, getSession } from "../api/client";
import { useSessionStore } from "../store/sessionStore";
import type { InterviewSession, KnowledgeTree } from "../shared/types";

function KnowledgeTreeChart({ tree }: { tree: KnowledgeTree }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ x: number; y: number; panX: number; panY: number }>();
  const root = tree.nodes.find((node) => node.id === "ROOT");
  const levelOne = tree.nodes.filter((node) => node.level === 1);
  const levelTwoByParent = new Map<string, KnowledgeTree["nodes"]>();

  for (const edge of tree.edges) {
    const target = tree.nodes.find((node) => node.id === edge.to);
    if (!target || target.level !== 2) continue;
    const list = levelTwoByParent.get(edge.from) ?? [];
    list.push(target);
    levelTwoByParent.set(edge.from, list);
  }

  const rootPoint = { x: 90, y: 240 };
  const branchGap = 118;
  const branchStartY = 64;
  const branchPoints = levelOne.map((node, index) => ({
    node,
    x: 310,
    y: branchStartY + index * branchGap
  }));
  const leafPoints = branchPoints.flatMap((branch) => {
    const leaves = levelTwoByParent.get(branch.node.id) ?? [];
    const startY = branch.y - ((leaves.length - 1) * 34) / 2;
    return leaves.map((node, index) => ({
      node,
      parentId: branch.node.id,
      x: 560,
      y: startY + index * 34
    }));
  });

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    event.preventDefault();
    dragState.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("dragging");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragState.current;
    if (!viewport || !drag) return;

    event.preventDefault();
    setPan({
      x: drag.panX + event.clientX - drag.x,
      y: drag.panY + event.clientY - drag.y
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    dragState.current = undefined;
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    viewport?.classList.remove("dragging");
  };

  return (
    <div
      className="knowledge-chart"
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => setPan({ x: 0, y: 0 })}
    >
      <svg viewBox="0 0 820 520" role="img" aria-label="知识树图表">
        <g transform={`translate(${pan.x}, ${pan.y})`}>
          {branchPoints.map((branch) => (
            <path
              d={`M ${rootPoint.x + 82} ${rootPoint.y} C 230 ${rootPoint.y}, 230 ${branch.y}, ${branch.x - 92} ${branch.y}`}
              className="knowledge-link primary"
              key={`root-${branch.node.id}`}
            />
          ))}
          {leafPoints.map((leaf) => {
            const parent = branchPoints.find((branch) => branch.node.id === leaf.parentId);
            if (!parent) return null;

            return (
              <path
                d={`M ${parent.x + 92} ${parent.y} C 430 ${parent.y}, 450 ${leaf.y}, ${leaf.x - 102} ${leaf.y}`}
                className="knowledge-link"
                key={`${leaf.parentId}-${leaf.node.id}`}
              />
            );
          })}
          {root && (
            <g transform={`translate(${rootPoint.x}, ${rootPoint.y})`}>
              <rect x="-76" y="-24" width="152" height="48" rx="8" className="knowledge-node root" />
              <text textAnchor="middle" dominantBaseline="middle" className="knowledge-text root-text">
                {root.label.slice(0, 14)}
              </text>
            </g>
          )}
          {branchPoints.map((branch) => (
            <g transform={`translate(${branch.x}, ${branch.y})`} key={branch.node.id}>
              <rect x="-86" y="-22" width="172" height="44" rx="8" className="knowledge-node branch" />
              <text textAnchor="middle" dominantBaseline="middle" className="knowledge-text">
                {branch.node.label}
              </text>
            </g>
          ))}
          {leafPoints.map((leaf) => (
            <g transform={`translate(${leaf.x}, ${leaf.y})`} key={leaf.node.id}>
              <rect x="-96" y="-17" width="192" height="34" rx="7" className="knowledge-node leaf" />
              <text textAnchor="middle" dominantBaseline="middle" className="knowledge-text leaf-text">
                {leaf.node.label.slice(0, 16)}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export function KnowledgeTreePage() {
  const { sessionId } = useParams();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tree, setTree] = useState<KnowledgeTree>();
  const currentSession = useSessionStore((state) => state.currentSession);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);

  useEffect(() => {
    async function load() {
      if (!sessionId) return;

      setLoading(true);
      try {
        const session = currentSession?.id === sessionId ? currentSession : await getSession(sessionId);
        setCurrentSession(session);
        const result = await generateKnowledgeTree({ sessionId });
        setTree(result);
      } catch (error) {
        message.error(error instanceof Error ? error.message : "知识树生成失败");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [currentSession, sessionId, setCurrentSession]);

  const session = currentSession as InterviewSession | undefined;

  const handleRegenerate = async () => {
    if (!sessionId) return;

    setGenerating(true);
    try {
      setTree(await generateKnowledgeTree({ sessionId }));
      message.success("知识树已刷新");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!tree) return;
    await navigator.clipboard.writeText(tree.mermaid);
    message.success("Mermaid 源码已复制");
  };

  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!session) return <Empty description="未找到这份准备记录" />;
  if (!tree) return <Empty description="暂无知识树" />;

  return (
    <section className="analysis-page">
      <div className="analysis-heading">
        <div>
          <Typography.Title level={1}>知识树</Typography.Title>
          <Typography.Paragraph>
            {session.company} · {session.jobTitle}，从 JD、搜集面经、简历短板和训练重点生成可解释关系图。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRegenerate} loading={generating}>
            刷新
          </Button>
          <Button icon={<CopyOutlined />} onClick={handleCopy}>
            复制 Mermaid
          </Button>
        </Space>
      </div>

      <div className="knowledge-layout">
        <Card className="panel-card mermaid-card" size="small" title="Mermaid 源码">
          <pre className="mermaid-source">{tree.mermaid}</pre>
        </Card>
        <Card className="panel-card knowledge-card" title="知识树图表">
          <KnowledgeTreeChart tree={tree} />
        </Card>
      </div>
    </section>
  );
}
