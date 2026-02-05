export default function HeartPage() {
    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-12 pl-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 flex items-baseline gap-3">
                    <span className="font-noto text-ink">本心</span>
                    <span className="font-serif text-amber italic text-3xl md:text-4xl opacity-90">Heart</span>
                </h1>
                <div className="text-ink/60 max-w-2xl text-lg font-serif space-y-4">
                    <p>于此，点亮我们的本心之火。</p>
                    <p>
                        每一座指引方向的灯塔，都源于一簇坚定的火焰。这里，将是我们共同定义的服务品牌核心。它将是我们的价值观、我们的哲学、我们共同的语言。光晕将由此而生，照亮我们每一个人的内心。
                    </p>
                    <p className="text-ink/40">—— Heart (本心) ，即将燃起</p>
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
                            src="/v3_01_heart_values_wall.png"
                            alt="文化内核"
                            className="w-full h-auto object-cover"
                        />
                        <figcaption className="px-5 py-4 text-ink/70 text-sm font-serif">
                            文化内核
                        </figcaption>
                    </figure>
                    <figure className="rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden backdrop-blur-sm">
                        <img
                            src="/v3_02_heart_story_page.png"
                            alt="文化故事"
                            className="w-full h-auto object-cover"
                        />
                        <figcaption className="px-5 py-4 text-ink/70 text-sm font-serif">
                            文化故事
                        </figcaption>
                    </figure>
                </div>
            </section>
        </div>
    );
}
