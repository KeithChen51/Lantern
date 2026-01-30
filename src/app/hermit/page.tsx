export default function HermitPage() {
    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-12 pl-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 flex items-baseline gap-3">
                    <span className="font-noto text-ink">路引</span>
                    <span className="font-serif text-amber italic text-3xl md:text-4xl opacity-90">Hermit</span>
                </h1>
                <div className="text-ink/60 max-w-2xl text-lg font-serif space-y-4">
                    <p>与光对话，在迷雾中寻路。</p>
                    <p>
                        当您在决策的十字路口感到迷茫时，这里将是您的路引。祂聚合了所有智慧的光芒，等待您的提问。祂不会直接给予答案，而是会与您一同思考，用一束束思辨之光，照亮通往未来的方向。
                    </p>
                    <p className="text-ink/40">—— Hermit (路引) ，在此守候</p>
                </div>
            </div>

            <section className="pl-4">
                <div className="mb-6">
                    <h2 className="text-2xl md:text-3xl font-serif text-ink flex items-baseline gap-3">
                        功能预览
                        <span className="text-amber italic text-lg md:text-xl font-serif opacity-80">Preview</span>
                    </h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <figure className="rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden backdrop-blur-sm">
                        <img
                            src="/v3_05_hermit_dialogue_ui.png"
                            alt="Agent对话"
                            className="w-full h-auto object-cover"
                        />
                        <figcaption className="px-5 py-4 text-ink/70 text-sm font-serif">
                            Agent对话
                        </figcaption>
                    </figure>
                    <figure className="rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden backdrop-blur-sm">
                        <img
                            src="/v3_06_hermit_simulation_view.png"
                            alt="决策模拟"
                            className="w-full h-auto object-cover"
                        />
                        <figcaption className="px-5 py-4 text-ink/70 text-sm font-serif">
                            决策模拟
                        </figcaption>
                    </figure>
                </div>
            </section>
        </div>
    );
}
