import Image from "next/image";

export default function ActionPage() {
    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-12 pl-4">
                <h1 className="text-4xl md:text-5xl font-bold mb-4 flex items-baseline gap-3">
                    <span className="font-noto text-ink">笃行</span>
                    <span className="font-serif text-amber italic text-3xl md:text-4xl opacity-90">Action</span>
                </h1>
                <div className="text-ink/60 max-w-2xl text-lg font-serif space-y-4">
                    <p>纵有风雨，何妨吟啸徐行。</p>
                    <p>
                        真正的笃行，并非总在坦途。当理念之光照进现实，总会遇到穿林打叶之声。在这里，我们将记录下那些不畏风雨的实践——他们将文化内化为“竹杖芒鞋”，便觉“轻胜马”。这是一种源于内心的力量，胜过万千外部的资源。每一次坚定的迈步，每一次从容的转身，都将汇聚成我们共同走出的、独一无二的道路。
                    </p>
                    <p className="text-ink/40">—— Action (笃行) ，即将启程</p>
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
                        <Image
                            src="/v3_03_action_case_card.webp"
                            alt="内部行动案例"
                            width={1600}
                            height={900}
                            sizes="(max-width: 1024px) 100vw, 50vw"
                            className="w-full h-auto object-cover"
                        />
                        <figcaption className="px-5 py-4 text-ink/70 text-sm font-serif">
                            内部行动案例
                        </figcaption>
                    </figure>
                    <figure className="rounded-2xl bg-white/40 border border-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.06)] overflow-hidden backdrop-blur-sm">
                        <Image
                            src="/v3_04_action_path_graphic.webp"
                            alt="行动路径"
                            width={1600}
                            height={900}
                            sizes="(max-width: 1024px) 100vw, 50vw"
                            className="w-full h-auto object-cover"
                        />
                        <figcaption className="px-5 py-4 text-ink/70 text-sm font-serif">
                            行动路径
                        </figcaption>
                    </figure>
                </div>
            </section>
        </div>
    );
}
